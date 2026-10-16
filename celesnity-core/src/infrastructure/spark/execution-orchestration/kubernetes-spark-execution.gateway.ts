import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';

import type { ConfigService } from '@nestjs/config';

import { ExecutionPortError } from '@application/execution-orchestration/errors/execution-port.error';
import type {
  ISparkExecutionGateway,
  PythonSyntaxResult,
  SparkSubmission,
  SparkSubmissionInput,
  SparkSubmissionResult,
} from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import { secretRedactor } from '@application/shared/secret-redactor';
import { toConnectionEnvironment } from '@infrastructure/spark/execution-orchestration/connection-environment';
import { SparkStandaloneCapacityProbe } from '@infrastructure/spark/execution-orchestration/spark-standalone-capacity.probe';
import type { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';

const SERVICE_ACCOUNT_DIRECTORY = '/var/run/secrets/kubernetes.io/serviceaccount';
const SPARK_APPLICATION_ID_PATTERN = /(app-\d{8,}-\d+|application_\d+_\d+)/u;
const SPARK_CONTAINER_NAME = 'spark';

interface KubernetesObjectMeta {
  readonly name?: string;
}

interface KubernetesPod {
  readonly metadata?: KubernetesObjectMeta;
  readonly status?: {
    readonly phase?: string;
    readonly containerStatuses?: ReadonlyArray<{
      readonly state?: { readonly terminated?: { readonly exitCode?: number } };
    }>;
  };
}

interface KubernetesJob {
  readonly status?: { readonly succeeded?: number; readonly failed?: number };
}

interface KubernetesList<T> {
  readonly items?: readonly T[];
}

export interface KubernetesGatewayConfig {
  readonly namespace: string;
  readonly image: string;
  readonly serviceAccount: string;
  readonly masterUrl: string;
  readonly submitBin: string;
  readonly pollIntervalMs: number;
  readonly jobTtlSeconds: number;
}

/** Minimal in-cluster Kubernetes client, intentionally limited to this gateway's namespace. */
class InClusterKubernetesClient {
  private readonly host = process.env.KUBERNETES_SERVICE_HOST ?? 'kubernetes.default.svc';
  private readonly port = Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? '443');
  private readonly token = readFileSync(`${SERVICE_ACCOUNT_DIRECTORY}/token`, 'utf8').trim();
  private readonly ca = readFileSync(`${SERVICE_ACCOUNT_DIRECTORY}/ca.crt`);

  public requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request(method, path, body).then((response) =>
      response === '' ? (undefined as T) : (JSON.parse(response) as T),
    );
  }

  public requestText(method: string, path: string): Promise<string> {
    return this.request(method, path);
  }

  private request(method: string, path: string, body?: unknown): Promise<string> {
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<string>((resolve, reject) => {
      const request = httpsRequest(
        {
          hostname: this.host,
          port: this.port,
          path,
          method,
          ca: this.ca,
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: 'application/json',
            ...(encodedBody === undefined
              ? {}
              : {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(encodedBody),
                }),
          },
        },
        (response) => {
          let responseBody = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            responseBody += chunk;
          });
          response.on('end', () => {
            const status = response.statusCode ?? 500;
            if (status >= 200 && status < 300) {
              resolve(responseBody);
              return;
            }
            reject(new KubernetesApiError(method, path, status));
          });
        },
      );
      request.on('error', reject);
      if (encodedBody !== undefined) {
        request.write(encodedBody);
      }
      request.end();
    });
  }
}

export class KubernetesSparkExecutionGateway implements ISparkExecutionGateway {
  private readonly runtime: KubernetesGatewayConfig;
  private readonly capacity: SparkStandaloneCapacityProbe;
  private client: InClusterKubernetesClient | undefined;

  public constructor(config: ConfigService) {
    this.runtime = {
      namespace: config.getOrThrow<string>('KUBERNETES_NAMESPACE'),
      image: config.getOrThrow<string>('SPARK_EXECUTION_IMAGE'),
      serviceAccount: config.getOrThrow<string>('SPARK_JOB_SERVICE_ACCOUNT'),
      masterUrl: config.getOrThrow<string>('SPARK_SUBMIT_MASTER_URL'),
      submitBin: config.getOrThrow<string>('SPARK_SUBMIT_BIN'),
      pollIntervalMs: config.getOrThrow<number>('SPARK_KUBERNETES_POLL_INTERVAL_MS'),
      jobTtlSeconds: config.getOrThrow<number>('SPARK_JOB_TTL_SECONDS'),
    };
    this.capacity = new SparkStandaloneCapacityProbe(this.runtime.masterUrl);
  }

  public assertCapacity(resourceProfile: ResourceProfile): Promise<void> {
    return this.capacity.assertAvailable(resourceProfile);
  }

  public async stageSource(executionId: string, source: Uint8Array): Promise<string> {
    const name = executionResourceName(executionId);
    try {
      await this.api().requestJson(
        'POST',
        `/api/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/configmaps`,
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name, labels: executionLabels(executionId) },
          immutable: true,
          binaryData: { 'script.py': Buffer.from(source).toString('base64') },
        },
      );
    } catch (error: unknown) {
      // A lost response can make the worker retry after the immutable ConfigMap was
      // successfully created. The deterministic name makes that retry idempotent.
      if (!(error instanceof KubernetesApiError) || error.statusCode !== 409) {
        throw error;
      }
    }
    return name;
  }

  public async stageRuntimeConfig(executionId: string, bytes: Uint8Array): Promise<string> {
    const name = runtimeConfigName(executionId);
    try {
      await this.api().requestJson(
        'POST',
        `/api/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/secrets`,
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name, labels: executionLabels(executionId) },
          immutable: true,
          type: 'Opaque',
          binaryData: { 'condition-plan.json': Buffer.from(bytes).toString('base64') },
        },
      );
    } catch (error: unknown) {
      if (!(error instanceof KubernetesApiError) || error.statusCode !== 409) {
        throw error;
      }
    }
    return name;
  }

  public validatePythonSyntax(): Promise<PythonSyntaxResult> {
    // The worker image intentionally contains no Python runtime. The Job runs py_compile
    // before spark-submit, so invalid source still fails without occupying Spark capacity.
    return Promise.resolve({ ok: true, output: '' });
  }

  public submit(input: SparkSubmissionInput): SparkSubmission {
    return new KubernetesSparkSubmission(this.api(), this.runtime, input);
  }

  public async cleanup(stagedSourceRef: string): Promise<void> {
    const namespace = encodeURIComponent(this.runtime.namespace);
    await Promise.allSettled([
      this.api().requestJson(
        'DELETE',
        `/api/v1/namespaces/${namespace}/configmaps/${encodeURIComponent(stagedSourceRef)}`,
        {},
      ),
      this.api().requestJson(
        'DELETE',
        `/api/v1/namespaces/${namespace}/secrets/${encodeURIComponent(credentialsName(stagedSourceRef))}`,
        {},
      ),
    ]);
  }

  public async cleanupRuntimeConfig(runtimeConfigRef: string): Promise<void> {
    const namespace = encodeURIComponent(this.runtime.namespace);
    await this.api()
      .requestJson(
        'DELETE',
        `/api/v1/namespaces/${namespace}/secrets/${encodeURIComponent(runtimeConfigRef)}`,
        {},
      )
      .catch(() => undefined);
  }

  private api(): InClusterKubernetesClient {
    this.client ??= new InClusterKubernetesClient();
    return this.client;
  }
}

class KubernetesSparkSubmission implements SparkSubmission {
  public readonly completed: Promise<SparkSubmissionResult>;
  private readonly listeners: Array<(chunk: string) => void> = [];
  private sparkApplicationId: string | undefined;
  private terminated = false;
  private deleteRequested: Promise<unknown> | undefined;

  public constructor(
    private readonly client: InClusterKubernetesClient,
    private readonly runtime: KubernetesGatewayConfig,
    private readonly input: SparkSubmissionInput,
  ) {
    this.completed = this.run();
  }

  public onOutput(listener: (chunk: string) => void): void {
    this.listeners.push(listener);
  }

  public currentSparkApplicationId(): string | undefined {
    return this.sparkApplicationId;
  }

  public terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    const namespace = encodeURIComponent(this.runtime.namespace);
    this.deleteRequested = this.client
      .requestJson(
        'DELETE',
        `/apis/batch/v1/namespaces/${namespace}/jobs/${encodeURIComponent(this.input.stagedSourceRef)}?propagationPolicy=Foreground&gracePeriodSeconds=0`,
        {},
      )
      .catch(() => undefined);
  }

  private async run(): Promise<SparkSubmissionResult> {
    try {
      await this.createCredentials();
      await this.client.requestJson(
        'POST',
        `/apis/batch/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/jobs`,
        buildExecutionJob(this.runtime, this.input),
      );
      return await this.watchUntilComplete();
    } catch (error: unknown) {
      throw ExecutionPortError.sparkUnavailable(secretRedactor.redact(safeMessage(error)));
    }
  }

  private async createCredentials(): Promise<void> {
    await this.client.requestJson(
      'POST',
      `/api/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/secrets`,
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: credentialsName(this.input.stagedSourceRef),
          labels: executionLabels(this.input.stagedSourceRef.replace(/^celesnity-exec-/u, '')),
        },
        immutable: true,
        type: 'Opaque',
        stringData: toConnectionEnvironment(this.input.connection),
      },
    );
  }

  private async watchUntilComplete(): Promise<SparkSubmissionResult> {
    let podName: string | undefined;
    let deliveredLog = '';
    let runningAnnounced = false;

    for (;;) {
      if (this.terminated) {
        await this.deleteRequested;
        return {
          exitCode: undefined,
          signal: 'SIGTERM',
          sparkApplicationId: this.sparkApplicationId,
        };
      }

      podName ??= await this.findPodName();
      if (podName !== undefined) {
        const pod = await this.readPod(podName);
        if (pod.status?.phase === 'Running' && !runningAnnounced) {
          runningAnnounced = true;
          this.emit(`[celesnity] Spark driver pod ${podName} is running\n`);
        }
        const currentLog = await this.readLog(podName);
        if (currentLog.startsWith(deliveredLog)) {
          this.emit(currentLog.slice(deliveredLog.length));
        } else if (currentLog !== deliveredLog) {
          this.emit(currentLog);
        }
        deliveredLog = currentLog;
      }

      const job = await this.readJob();
      if ((job.status?.succeeded ?? 0) > 0 || (job.status?.failed ?? 0) > 0) {
        const exitCode = podName === undefined ? undefined : await this.readExitCode(podName);
        return {
          exitCode: exitCode ?? ((job.status?.succeeded ?? 0) > 0 ? 0 : 1),
          signal: undefined,
          sparkApplicationId: this.sparkApplicationId,
        };
      }
      await delay(this.runtime.pollIntervalMs);
    }
  }

  private async findPodName(): Promise<string | undefined> {
    const namespace = encodeURIComponent(this.runtime.namespace);
    const selector = encodeURIComponent(`job-name=${this.input.stagedSourceRef}`);
    const pods = await this.client.requestJson<KubernetesList<KubernetesPod>>(
      'GET',
      `/api/v1/namespaces/${namespace}/pods?labelSelector=${selector}`,
    );
    return pods.items?.[0]?.metadata?.name;
  }

  private readPod(name: string): Promise<KubernetesPod> {
    return this.client.requestJson(
      'GET',
      `/api/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/pods/${encodeURIComponent(name)}`,
    );
  }

  private readJob(): Promise<KubernetesJob> {
    return this.client.requestJson(
      'GET',
      `/apis/batch/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/jobs/${encodeURIComponent(this.input.stagedSourceRef)}`,
    );
  }

  private async readLog(name: string): Promise<string> {
    try {
      return await this.client.requestText(
        'GET',
        `/api/v1/namespaces/${encodeURIComponent(this.runtime.namespace)}/pods/${encodeURIComponent(name)}/log?container=${SPARK_CONTAINER_NAME}`,
      );
    } catch {
      return '';
    }
  }

  private async readExitCode(name: string): Promise<number | undefined> {
    const pod = await this.readPod(name);
    return pod.status?.containerStatuses?.[0]?.state?.terminated?.exitCode;
  }

  private emit(chunk: string): void {
    if (chunk === '') {
      return;
    }
    const redacted = secretRedactor.redact(chunk);
    this.sparkApplicationId ??= redacted.match(SPARK_APPLICATION_ID_PATTERN)?.[1];
    for (const listener of this.listeners) {
      listener(redacted);
    }
  }
}

export function buildExecutionJob(
  runtime: KubernetesGatewayConfig,
  input: SparkSubmissionInput,
): Record<string, unknown> {
  const sourceName = input.stagedSourceRef;
  const executionId = sourceName.replace(/^celesnity-exec-/u, '');
  const command = [
    'python3 -m py_compile /execution/script.py',
    `exec ${shellQuote(runtime.submitBin)} --master ${shellQuote(runtime.masterUrl)} --deploy-mode client \\\n  --conf spark.driver.host="$POD_IP" \\\n  --conf spark.driver.bindAddress=0.0.0.0 \\\n  --conf spark.driver.port=7078 \\\n  --conf spark.blockManager.port=7079 \\\n  --conf ${shellQuote(`spark.driver.memory=${input.resourceProfile.driverMemory}`)} \\\n  --conf ${shellQuote(`spark.executor.memory=${input.resourceProfile.executorMemory}`)} \\\n  --conf ${shellQuote(`spark.executor.cores=${input.resourceProfile.executorCores}`)} \\\n  --conf ${shellQuote(`spark.cores.max=${input.resourceProfile.maxCores}`)} \\\n  --conf spark.jars.ivy=/opt/spark/ivy \\\n  /execution/script.py "$@"`,
  ].join('\n');

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: sourceName, labels: executionLabels(executionId) },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: runtime.jobTtlSeconds,
      template: {
        metadata: { labels: executionLabels(executionId) },
        spec: {
          restartPolicy: 'Never',
          serviceAccountName: runtime.serviceAccount,
          securityContext: { runAsNonRoot: true, runAsUser: 185, runAsGroup: 185, fsGroup: 185 },
          containers: [
            {
              name: SPARK_CONTAINER_NAME,
              image: runtime.image,
              imagePullPolicy: 'IfNotPresent',
              command: ['/bin/bash', '-ceu', '--'],
              args: [
                command,
                'celesnity-spark-job',
                ...input.arguments,
                ...(input.runtimeConfigRef === undefined
                  ? []
                  : ['--workflow-facts-plan-ref=/execution/runtime/condition-plan.json']),
              ],
              env: [
                {
                  name: 'POD_IP',
                  valueFrom: { fieldRef: { fieldPath: 'status.podIP' } },
                },
                { name: 'PYTHONPYCACHEPREFIX', value: '/tmp/python-cache' },
                { name: 'POSTGRES_SSLMODE', value: 'require' },
                {
                  name: 'WAREHOUSE_PATH',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'celesnity-storage',
                      key: 'WAREHOUSE_S3_PATH',
                    },
                  },
                },
                ...catalogSecretEnvironment(),
              ],
              envFrom: [
                { secretRef: { name: 'celesnity-database' } },
                { configMapRef: { name: 'celesnity-storage' } },
                { secretRef: { name: credentialsName(sourceName) } },
              ],
              ports: [
                { name: 'driver', containerPort: 7078 },
                { name: 'block-manager', containerPort: 7079 },
              ],
              resources: {
                requests: {
                  cpu: '100m',
                  memory: sparkDriverPodMemory(input.resourceProfile.driverMemory),
                },
                limits: { memory: sparkDriverPodMemory(input.resourceProfile.driverMemory) },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] },
              },
              volumeMounts: [
                { name: 'source', mountPath: '/execution', readOnly: true },
                ...(input.runtimeConfigRef === undefined
                  ? []
                  : [{ name: 'runtime-config', mountPath: '/execution/runtime', readOnly: true }]),
                { name: 'ivy', mountPath: '/opt/spark/ivy' },
                { name: 'work', mountPath: '/opt/spark/work' },
              ],
            },
          ],
          volumes: [
            { name: 'source', configMap: { name: sourceName } },
            ...(input.runtimeConfigRef === undefined
              ? []
              : [
                  {
                    name: 'runtime-config',
                    secret: { secretName: input.runtimeConfigRef, defaultMode: 288 },
                  },
                ]),
            { name: 'ivy', emptyDir: {} },
            { name: 'work', emptyDir: {} },
          ],
        },
      },
    },
  };
}

function catalogSecretEnvironment(): readonly Record<string, unknown>[] {
  return [
    secretEnvironment('CELESNITY_CATALOG_JDBC_URL', 'POSTGRES_URL'),
    secretEnvironment('CELESNITY_CATALOG_JDBC_USER', 'POSTGRES_USER'),
    secretEnvironment('CELESNITY_CATALOG_JDBC_PASSWORD', 'POSTGRES_PASSWORD'),
  ];
}

function secretEnvironment(name: string, key: string): Record<string, unknown> {
  return {
    name,
    valueFrom: { secretKeyRef: { name: 'celesnity-database', key } },
  };
}

function executionResourceName(executionId: string): string {
  const normalized = executionId
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (normalized === '' || normalized.length > 36) {
    throw ExecutionPortError.sparkUnavailable(
      'Execution ID cannot be represented as a Kubernetes resource name.',
    );
  }
  return `celesnity-exec-${normalized}`;
}

function credentialsName(sourceName: string): string {
  return `${sourceName}-credentials`;
}

function runtimeConfigName(executionId: string): string {
  return `${executionResourceName(executionId)}-runtime`;
}

function executionLabels(executionId: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': 'celesnity-spark-execution',
    'app.kubernetes.io/component': 'spark-driver',
    'celesnity.io/execution-id': executionId,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Spark quantities are lowercase; Kubernetes memory quantities are expressed in Mi here. */
export function sparkDriverPodMemory(value: string): string {
  const match = /^(\d+)([kmgt]?)(?:i?b?)$/iu.exec(value);
  if (match === null) {
    throw ExecutionPortError.sparkUnavailable('Driver memory has an unsupported Spark quantity.');
  }
  const amount = Number(match[1]);
  const exponent = ['', 'k', 'm', 'g', 't'].indexOf((match[2] ?? '').toLowerCase());
  const bytes = amount * 1024 ** exponent;
  const heapMi = Math.max(1, Math.ceil(bytes / 1024 ** 2));
  return `${heapMi + 384}Mi`;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected Kubernetes API error occurred.';
}

class KubernetesApiError extends Error {
  public constructor(
    method: string,
    path: string,
    public readonly statusCode: number,
  ) {
    super(`Kubernetes API ${method} ${path} returned HTTP ${statusCode}`);
    this.name = KubernetesApiError.name;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

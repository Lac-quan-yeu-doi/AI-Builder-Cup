import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { secretRedactor } from '@application/shared/secret-redactor';
import {
  type PythonSyntaxResult,
  type ISparkExecutionGateway,
  type SparkSubmission,
  type SparkSubmissionInput,
  type SparkSubmissionResult,
} from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import { ExecutionPortError } from '@application/execution-orchestration/errors/execution-port.error';
import { toConnectionEnvironment } from '@infrastructure/spark/execution-orchestration/connection-environment';
import { SparkStandaloneCapacityProbe } from '@infrastructure/spark/execution-orchestration/spark-standalone-capacity.probe';
import type { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';

const SPARK_APPLICATION_ID_PATTERN = /(app-\d{8,}-\d+|application_\d+_\d+)/u;
const EXECUTION_ID_ARGUMENT_PREFIX = '--execution-id=';
const GRACEFUL_TERMINATION_MS = 5_000;
const CONTAINER_TMP_DIR = '/tmp';

const CONTAINER_SUBMISSION_SCRIPT = [
  'pid_file="$1"',
  'shift',
  'rm -f "$pid_file"',
  'cleanup() { rm -f "$pid_file"; }',
  'trap cleanup EXIT',
  '"$@" &',
  'child=$!',
  'printf "%s\\n" "$child" > "$pid_file"',
  'trap \'kill -TERM "$child" 2>/dev/null || true\' TERM INT HUP',
  'wait "$child"',
].join('\n');

const CONTAINER_TERMINATION_SCRIPT = [
  'pid_file="$1"',
  'signal="$2"',
  '[ -s "$pid_file" ] || exit 0',
  'pid="$(cat "$pid_file")"',
  'case "$pid" in \'\'|*[!0-9]*) exit 0 ;; esac',
  'kill -s "$signal" "$pid" 2>/dev/null || true',
].join('\n');

interface ProcessResult {
  readonly exitCode: number | undefined;
  readonly output: string;
}

@Injectable()
export class DockerSparkExecutionGateway implements ISparkExecutionGateway {
  private readonly container: string;
  private readonly submitBin: string;
  private readonly masterUrl: string;
  private readonly capacity: SparkStandaloneCapacityProbe;

  public constructor(config: ConfigService) {
    this.container = config.getOrThrow<string>('SPARK_CONTAINER');
    this.submitBin = config.getOrThrow<string>('SPARK_SUBMIT_BIN');
    this.masterUrl = config.getOrThrow<string>('SPARK_SUBMIT_MASTER_URL');
    this.capacity = new SparkStandaloneCapacityProbe(this.masterUrl, {
      statusUrl: config.get<string>('SPARK_MASTER_STATUS_URL'),
      uiPort: config.getOrThrow<number>('SPARK_MASTER_UI_PORT'),
    });
  }

  public async stageSource(executionId: string, source: Uint8Array): Promise<string> {
    const containerScriptPath = `${CONTAINER_TMP_DIR}/celesnity-exec-${executionId}.py`;
    const hostPath = join(tmpdir(), `celesnity-exec-${executionId}-${randomUUID()}.py`);
    // `docker cp` preserves this mode and places the file as root inside the container,
    // while `docker exec` runs as the non-root `spark` user. The script source is not
    // secret, so stage it world-readable so the Spark user can read and submit it.
    await writeFile(hostPath, Buffer.from(source), { mode: 0o644 });
    try {
      const result = await this.runToCompletion('docker', [
        'cp',
        hostPath,
        `${this.container}:${containerScriptPath}`,
      ]);
      if (result.exitCode !== 0) {
        throw ExecutionPortError.sparkUnavailable(
          `Failed to stage the execution source into the Spark container. ${result.output}`.trim(),
        );
      }
    } finally {
      await rm(hostPath, { force: true }).catch(() => undefined);
    }
    return containerScriptPath;
  }

  public async stageRuntimeConfig(executionId: string, bytes: Uint8Array): Promise<string> {
    const containerPath = `${CONTAINER_TMP_DIR}/celesnity-exec-${executionId}-runtime.json`;
    const hostPath = join(tmpdir(), `celesnity-exec-${executionId}-${randomUUID()}.json`);
    await writeFile(hostPath, Buffer.from(bytes), { mode: 0o600 });
    let stagedInContainer = false;
    try {
      const result = await this.runToCompletion('docker', [
        'cp',
        hostPath,
        `${this.container}:${containerPath}`,
      ]);
      if (result.exitCode !== 0) {
        throw ExecutionPortError.sparkUnavailable(
          `Failed to stage the execution runtime config into the Spark container. ${result.output}`.trim(),
        );
      }
      stagedInContainer = true;
      const ownership = await this.runToCompletion('docker', [
        'exec',
        this.container,
        'chown',
        'spark:spark',
        containerPath,
      ]);
      if (ownership.exitCode !== 0) {
        throw ExecutionPortError.sparkUnavailable('Failed to protect the execution runtime config.');
      }
      const permissions = await this.runToCompletion('docker', [
        'exec',
        this.container,
        'chmod',
        '0640',
        containerPath,
      ]);
      if (permissions.exitCode !== 0) {
        throw ExecutionPortError.sparkUnavailable('Failed to protect the execution runtime config.');
      }
    } catch (error: unknown) {
      if (stagedInContainer) {
        await this.runToCompletion('docker', [
          'exec',
          this.container,
          'rm',
          '-f',
          containerPath,
        ]).catch(() => undefined);
      }
      throw error;
    } finally {
      await rm(hostPath, { force: true }).catch(() => undefined);
    }
    return containerPath;
  }

  public async validatePythonSyntax(containerScriptPath: string): Promise<PythonSyntaxResult> {
    const result = await this.runToCompletion('docker', [
      'exec',
      this.container,
      'python3',
      '-m',
      'py_compile',
      containerScriptPath,
    ]);
    return { ok: result.exitCode === 0, output: secretRedactor.redact(result.output) };
  }

  public assertCapacity(resourceProfile: ResourceProfile): Promise<void> {
    return this.capacity.assertAvailable(resourceProfile);
  }

  public submit(input: SparkSubmissionInput): SparkSubmission {
    const connectionEnv = toConnectionEnvironment(input.connection);
    const catalogEnv = platformCatalogEnvironment(process.env);
    const submissionEnv = {
      ...process.env,
      ...connectionEnv,
      ...catalogEnv,
    };
    const passthroughFlags = Object.keys({
      ...connectionEnv,
      ...catalogEnv,
    }).flatMap((name) => ['-e', name]);
    const executionId = input.arguments
      .find((argument) => argument.startsWith(EXECUTION_ID_ARGUMENT_PREFIX))
      ?.slice(EXECUTION_ID_ARGUMENT_PREFIX.length);
    const controlId =
      executionId === undefined || executionId.length === 0 ? randomUUID() : executionId;
    const pidFile = `${CONTAINER_TMP_DIR}/celesnity-submit-${controlId}.pid`;

    const submitArgs = [
      this.submitBin,
      '--master',
      this.masterUrl,
      '--deploy-mode',
      'client',
      '--conf',
      `spark.driver.memory=${input.resourceProfile.driverMemory}`,
      '--conf',
      `spark.executor.memory=${input.resourceProfile.executorMemory}`,
      '--conf',
      `spark.executor.cores=${input.resourceProfile.executorCores}`,
      '--conf',
      `spark.cores.max=${input.resourceProfile.maxCores}`,
      '--conf',
      'spark.jars.ivy=/opt/spark/ivy',
      input.stagedSourceRef,
      ...input.arguments,
      ...(input.runtimeConfigRef === undefined
        ? []
        : [`--workflow-facts-plan-ref=${input.runtimeConfigRef}`]),
    ];

    const args = [
      'exec',
      ...passthroughFlags,
      this.container,
      'bash',
      '-ceu',
      CONTAINER_SUBMISSION_SCRIPT,
      '--',
      pidFile,
      ...submitArgs,
    ];

    // Secrets are injected only through the child process environment and forwarded with
    // name-only `-e` flags, so they never appear in the argument vector or in logs.
    const child = spawn('docker', args, {
      env: submissionEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new DockerSparkSubmission(child, this.container, pidFile);
  }

  public async cleanup(containerScriptPath: string): Promise<void> {
    await this.runToCompletion('docker', [
      'exec',
      this.container,
      'rm',
      '-f',
      containerScriptPath,
    ]).catch(() => undefined);
  }

  public async cleanupRuntimeConfig(runtimeConfigRef: string): Promise<void> {
    await this.runToCompletion('docker', [
      'exec',
      this.container,
      'rm',
      '-f',
      runtimeConfigRef,
    ]).catch(() => undefined);
  }

  private runToCompletion(command: string, args: readonly string[]): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const capture = (chunk: Buffer): void => {
        output += chunk.toString('utf8');
      };
      child.stdout?.on('data', capture);
      child.stderr?.on('data', capture);
      child.on('error', (error: Error) => {
        reject(ExecutionPortError.sparkUnavailable(secretRedactor.redact(error.message)));
      });
      child.on('close', (code) => {
        resolve({ exitCode: code ?? undefined, output });
      });
    });
  }
}

function platformCatalogEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return definedEnvironment({
    CELESNITY_CATALOG_JDBC_URL: environment.CELESNITY_CATALOG_JDBC_URL ?? environment.POSTGRES_URL,
    CELESNITY_CATALOG_JDBC_USER:
      environment.CELESNITY_CATALOG_JDBC_USER ?? environment.POSTGRES_USER,
    CELESNITY_CATALOG_JDBC_PASSWORD:
      environment.CELESNITY_CATALOG_JDBC_PASSWORD ?? environment.POSTGRES_PASSWORD,
  });
}

function definedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

class DockerSparkSubmission implements SparkSubmission {
  public readonly completed: Promise<SparkSubmissionResult>;
  private readonly listeners: Array<(chunk: string) => void> = [];
  private sparkApplicationId: string | undefined;
  private terminated = false;

  public constructor(
    private readonly child: ChildProcess,
    private readonly container: string,
    private readonly pidFile: string,
  ) {
    this.completed = new Promise<SparkSubmissionResult>((resolve, reject) => {
      child.stdout?.on('data', (chunk: Buffer) => {
        this.handleChunk(chunk.toString('utf8'));
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        this.handleChunk(chunk.toString('utf8'));
      });
      child.on('error', (error: Error) => {
        reject(ExecutionPortError.sparkUnavailable(secretRedactor.redact(error.message)));
      });
      child.on('close', (code, signal) => {
        resolve({
          exitCode: code ?? undefined,
          signal: signal ?? undefined,
          sparkApplicationId: this.sparkApplicationId,
        });
      });
    });
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
    this.signalInsideContainer('TERM');
    const forceKill = setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.signalInsideContainer('KILL');
        this.child.kill('SIGKILL');
      }
    }, GRACEFUL_TERMINATION_MS);
    forceKill.unref();
  }

  private signalInsideContainer(signal: 'TERM' | 'KILL'): void {
    const control = spawn(
      'docker',
      [
        'exec',
        this.container,
        'bash',
        '-ceu',
        CONTAINER_TERMINATION_SCRIPT,
        '--',
        this.pidFile,
        signal,
      ],
      { stdio: 'ignore' },
    );
    control.on('error', () => undefined);
    control.unref();
  }

  private handleChunk(raw: string): void {
    const chunk = secretRedactor.redact(raw);
    if (this.sparkApplicationId === undefined) {
      const match = SPARK_APPLICATION_ID_PATTERN.exec(chunk);
      if (match !== null) {
        this.sparkApplicationId = match[1];
      }
    }
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }
}

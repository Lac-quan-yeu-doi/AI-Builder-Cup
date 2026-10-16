import { randomUUID } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

import { TestBackgroundContextStore } from '@tests/application/administration/background-principal.fixture';
import { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import { CreateWorkflowUseCase } from '@application/data-workflow/create-workflow.use-case';
import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWorkflowPipelineExecutor,
  WorkflowPipelineStatus,
  WorkflowPreparedPipelineRequest,
} from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { WorkflowNodeAttemptIdentity } from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import type { IWorkflowPipelinePreparer } from '@application/data-workflow/interfaces/i-workflow-pipeline-preparer';
import { PublishWorkflowUseCase } from '@application/data-workflow/publish-workflow.use-case';
import { RetryWorkflowNodeUseCase } from '@application/data-workflow/retry-workflow-node.use-case';
import { StartWorkflowRunUseCase } from '@application/data-workflow/start-workflow-run.use-case';
import { WorkflowRunAuthorizationService } from '@application/data-workflow/workflow-run-authorization.service';
import { WorkflowRunErrorCode } from '@application/data-workflow/workflow-run.error';
import { PreparedExecutionRequestService } from '@application/execution-orchestration/prepared-execution-request.service';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import { ExecutionMapper } from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { PrismaExecutionReader } from '@infrastructure/prisma/execution-orchestration/prisma-execution.reader';
import { PrismaExecutionRepository } from '@infrastructure/prisma/execution-orchestration/prisma-execution.repository';
import { WorkflowAccessAdapter } from '@infrastructure/data-workflow/workflow-access.adapter';
import { WorkflowPipelineExecutorAdapter } from '@infrastructure/data-workflow/workflow-pipeline-executor.adapter';
import { CronWorkflowTriggerSchedule } from '@infrastructure/data-workflow/cron-workflow-trigger-schedule';
import { PrismaWorkflowNodeAttemptExecutionRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-node-attempt-execution.repository';
import { PrismaWorkflowRunClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-run-claim.store';
import { PrismaWorkflowRunRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-run.repository';
import { PrismaWorkflowRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow.repository';
import { PrismaWorkflowScheduleRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule.repository';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaUnitOfWork } from '@infrastructure/prisma/prisma-unit-of-work';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

const databaseUrl = process.env.DATA_WORKFLOW_INTEGRATION_DATABASE_URL;
const DATABASE_NAME = 'celesnity_data_workflow_foundation_test';
const MIGRATION_NAME = '20260917090000_data_workflows';

interface MutableClock {
  current: Date;
  now(): Date;
}

interface Session {
  readonly contexts: TestBackgroundContextStore;
  readonly prisma: PrismaService;
  readonly workflows: PrismaWorkflowRepository;
  readonly runs: PrismaWorkflowRunRepository;
  readonly claims: PrismaWorkflowRunClaimStore;
  readonly schedules: PrismaWorkflowScheduleRepository;
  readonly unitOfWork: PrismaUnitOfWork;
  readonly executor: IWorkflowPipelineExecutor;
}

interface PipelineFixture {
  readonly id: string;
  readonly versionId: string;
}

/**
 * Test-only fault seam: the wrapped adapter has already committed the
 * execution, outbox event, and attempt association before this hook can throw.
 */
class PostCommitDispatchFault {
  private nextError: Error | undefined;

  public failNext(): void {
    this.nextError = new Error('Simulated response loss after durable workflow dispatch.');
  }

  public afterCommittedEnqueue(): void {
    const error = this.nextError;
    this.nextError = undefined;
    if (error !== undefined) throw error;
  }
}

class FaultInjectingWorkflowPipelineExecutor implements IWorkflowPipelineExecutor {
  public constructor(
    private readonly delegate: IWorkflowPipelineExecutor,
    private readonly fault: PostCommitDispatchFault,
  ) {}

  public prepare(actor: WorkflowActor, pipeline: PipelineReference) {
    return this.delegate.prepare(actor, pipeline);
  }

  public async enqueuePrepared(
    attempt: WorkflowNodeAttemptIdentity,
    request: WorkflowPreparedPipelineRequest,
  ) {
    const queued = await this.delegate.enqueuePrepared(attempt, request);
    this.fault.afterCommittedEnqueue();
    return queued;
  }

  public read(executionId: string): Promise<WorkflowPipelineStatus> {
    return this.delegate.read(executionId);
  }

  public readResult(executionId: string) {
    return this.delegate.readResult(executionId);
  }
}

const graph: WorkflowGraph = {
  nodes: [
    { id: 'trigger', type: 'TRIGGER' },
    { id: 'split', type: 'PARALLEL_SPLIT' },
    { id: 'a', type: 'PIPELINE', pipelineId: '', versionNumber: 1 },
    { id: 'b', type: 'PIPELINE', pipelineId: '', versionNumber: 1 },
    { id: 'join', type: 'JOIN' },
    { id: 'c', type: 'PIPELINE', pipelineId: '', versionNumber: 1 },
  ],
  edges: [
    edge('trigger-split', 'trigger', 'out', 'split', 'in'),
    edge('split-a', 'split', 'out', 'a', 'in'),
    edge('split-b', 'split', 'out', 'b', 'in'),
    edge('a-join', 'a', 'out', 'join', 'in'),
    edge('b-join', 'b', 'out', 'join', 'in'),
    edge('join-c', 'join', 'out', 'c', 'in'),
  ],
};

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
) {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}

function safetyError(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'DATA_WORKFLOW_INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL.';
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return 'DATA_WORKFLOW_INTEGRATION_DATABASE_URL must use a PostgreSQL URL.';
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    return 'DATA_WORKFLOW_INTEGRATION_DATABASE_URL must target a loopback host.';
  }
  if (url.pathname.replace(/^\//, '') !== DATABASE_NAME) {
    return `DATA_WORKFLOW_INTEGRATION_DATABASE_URL must target only ${DATABASE_NAME}.`;
  }
  if (url.searchParams.get('schema') !== 'celesnity_app') {
    return 'DATA_WORKFLOW_INTEGRATION_DATABASE_URL must select the celesnity_app schema.';
  }
  return undefined;
}

async function assertMigratedDisposableDatabase(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ readonly applied: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM "celesnity_app"."_prisma_migrations"
        WHERE migration_name = '${MIGRATION_NAME}' AND finished_at IS NOT NULL
      ) AS "applied"
    `);
    if (result.rows[0]?.applied !== true) {
      throw new Error(`Disposable database must have completed migration ${MIGRATION_NAME}.`);
    }
  } finally {
    await client.end();
  }
}

function skippedSuite(): void {
  describe.skip('Data Workflow foundation (disposable PostgreSQL)', () => {
    it('requires DATA_WORKFLOW_INTEGRATION_DATABASE_URL', () => undefined);
  });
}

function rejectedSuite(message: string): void {
  describe('Data Workflow foundation (disposable PostgreSQL)', () => {
    it('fails closed for an unsafe test database URL', () => {
      throw new Error(message);
    });
  });
}

function enabledSuite(url: string): void {
  describe('Data Workflow foundation (disposable PostgreSQL)', () => {
    const organizationA = randomUUID();
    const organizationB = randomUUID();
    const actor: WorkflowActor = { organizationId: organizationA, identityId: randomUUID() };
    const clock: MutableClock = {
      current: new Date(0),
      now() {
        return this.current;
      },
    };
    const versions = new Map<string, string>();
    const responseLoss = new PostCommitDispatchFault();
    let first: Session;
    let second: Session;

    beforeAll(async () => {
      await assertMigratedDisposableDatabase(url);
      // PostgreSQL enforces lease fences against its own current clock.  Start
      // from live time, then retain deterministic test-controlled increments.
      clock.current = new Date();
      first = session(url, organizationA, clock, versions);
      second = session(url, organizationA, clock, versions, responseLoss);
      await Promise.all([first.prisma.onModuleInit(), second.prisma.onModuleInit()]);
      await first.prisma.client.organization.createMany({
        data: [
          organization(organizationA, 'foundation-a'),
          organization(organizationB, 'foundation-b'),
        ],
      });
      await first.prisma.client.userIdentity.create({
        data: {
          id: actor.identityId,
          provider: 'integration',
          subject: `foundation-${actor.identityId}`,
          status: 'ACTIVE',
        },
      });
      await first.prisma.client.organizationMembership.create({
        data: {
          id: randomUUID(),
          organizationId: organizationA,
          identityId: actor.identityId,
          role: 'DATA_ENGINEER',
          status: 'ACTIVE',
        },
      });
    });

    afterAll(async () => {
      if (first === undefined) return;
      await Promise.all([
        first.prisma.onApplicationShutdown(),
        second.prisma.onApplicationShutdown(),
      ]);
    });

    it('author -> publish -> Run now advances parallel jobs through a join without duplicate execution associations', async () => {
      const pipelines = await createPipelines(first, actor, ['a', 'b', 'c']);
      for (const fixture of Object.values(pipelines)) {
        versions.set(`${fixture.id}:1`, fixture.versionId);
      }
      const workflowGraph = graphWithPipelines(pipelines);
      const permissiveAccess: IWorkflowAccess = {
        require: async () => undefined,
        requirePipeline: async () => undefined,
      };
      const ids = { next: () => randomUUID() };
      const create = new CreateWorkflowUseCase(first.workflows, permissiveAccess, clock, ids);
      const publish = new PublishWorkflowUseCase(
        first.workflows,
        first.schedules,
        new CronWorkflowTriggerSchedule(),
        first.unitOfWork,
        permissiveAccess,
        { prepare: async () => undefined } satisfies IWorkflowPipelinePreparer,
        clock,
        ids,
        { describe: async (_actor, reference) => ({ name: reference.pipelineId }) },
      );
      const start = new StartWorkflowRunUseCase(
        first.workflows,
        first.runs,
        permissiveAccess,
        clock,
        ids,
      );
      const advanceFirst = new AdvanceWorkflowRunService(
        first.workflows,
        first.runs,
        first.executor,
        clock,
        ids,
      );
      const advanceSecond = new AdvanceWorkflowRunService(
        second.workflows,
        second.runs,
        second.executor,
        clock,
        ids,
      );

      const workflow = await first.contexts.runBackground(organizationA, () =>
        create.execute(actor, { name: 'Parallel import', graph: workflowGraph }),
      );
      await first.contexts.runBackground(organizationA, () => publish.execute(actor, workflow.id));
      const started = await first.contexts.runBackground(organizationA, () =>
        start.execute({ actor, workflowId: workflow.id, parameters: { batch: 'integration' } }),
      );

      // A request-context repository cannot discover another organization's run.
      await expect(
        first.contexts.runBackground(organizationB, () => first.runs.find(started.runId)),
      ).resolves.toBeUndefined();

      const initialClaim = await first.claims.claimDue({
        limit: 1,
        owner: 'worker-initial',
        now: clock.now(),
        leaseMs: 30_000,
        reconciliationMs: 1_000,
      });
      expect(initialClaim).toHaveLength(1);
      const initialLease = initialClaim[0]!;
      await first.contexts.runBackground(organizationA, () =>
        advanceFirst.tick({ runId: started.runId, leaseToken: initialLease.leaseToken }),
      );

      let snapshot = await first.contexts.runBackground(organizationA, () =>
        first.runs.findSnapshot(started.runId),
      );
      expect(snapshot?.nodeAttempts.map((attempt) => attempt.nodeId).sort()).toEqual(['a', 'b']);
      const parallelExecutionIds = snapshot!.nodeAttempts.map((attempt) => attempt.executionId);
      expect(parallelExecutionIds).toEqual([expect.any(String), expect.any(String)]);
      expect(
        await first.contexts.runBackground(organizationA, () =>
          first.prisma.client.outboxEvent.count({ where: { aggregateType: 'Execution' } }),
        ),
      ).toBe(2);

      // Current membership is checked again inside the worker's tenant context,
      // rather than trusting the stored actor or the original HTTP request.
      const liveAccess = new WorkflowAccessAdapter(first.prisma);
      const authorize = new WorkflowRunAuthorizationService(
        first.workflows,
        first.runs,
        liveAccess,
        clock,
      );
      await first.contexts.runBackground(organizationA, () =>
        liveAccess.require(actor, 'RUN', workflow.id),
      );
      await first.prisma.client.organizationMembership.updateMany({
        where: { organizationId: organizationA, identityId: actor.identityId },
        data: { status: 'REVOKED' },
      });
      await expect(
        first.contexts.runBackground(organizationA, () =>
          authorize.authorize(started.runId, initialLease.leaseToken),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await first.prisma.client.organizationMembership.updateMany({
        where: { organizationId: organizationA, identityId: actor.identityId },
        data: { status: 'ACTIVE' },
      });

      // A retry is refused while an append-capable node may still be writing.
      const retry = new RetryWorkflowNodeUseCase(
        first.workflows,
        first.runs,
        permissiveAccess,
        first.executor,
        clock,
        ids,
      );
      await expect(
        first.contexts.runBackground(organizationA, () =>
          retry.execute({
            actor,
            runId: started.runId,
            nodeId: 'a',
            expectedRevision: snapshot!.run.revision,
            acknowledgeWriteRisk: true,
          }),
        ),
      ).rejects.toMatchObject({ code: WorkflowRunErrorCode.RETRY_NOT_ALLOWED });

      // Simulate process loss after dispatch commit: a recovered worker must use
      // the durable attempts and cannot associate a replacement execution.
      clock.current = new Date(clock.now().getTime() + 30_001);
      const recoveredClaim = await second.claims.claimDue({
        limit: 1,
        owner: 'worker-recovered',
        now: clock.now(),
        leaseMs: 30_000,
        reconciliationMs: 1_000,
      });
      expect(recoveredClaim).toHaveLength(1);
      const recoveredLease = recoveredClaim[0]!;
      await expect(
        first.contexts.runBackground(organizationA, () =>
          advanceFirst.tick({ runId: started.runId, leaseToken: initialLease.leaseToken }),
        ),
      ).rejects.toMatchObject({ code: WorkflowRunErrorCode.LEASE_MISMATCH });

      await first.contexts.runBackground(organizationA, () =>
        first.prisma.client.execution.updateMany({
          where: {
            id: { in: parallelExecutionIds.filter((id): id is string => id !== undefined) },
          },
          data: { status: 'SUCCEEDED', finishedAt: clock.now() },
        }),
      );
      responseLoss.failNext();
      await expect(
        second.contexts.runBackground(organizationA, () =>
          advanceSecond.tick({ runId: started.runId, leaseToken: recoveredLease.leaseToken }),
        ),
      ).rejects.toThrow('Simulated response loss after durable workflow dispatch.');
      snapshot = await second.contexts.runBackground(organizationA, () =>
        second.runs.findSnapshot(started.runId),
      );
      const cAttempt = snapshot!.nodeAttempts.find((attempt) => attempt.nodeId === 'c');
      expect(cAttempt?.executionId).toEqual(expect.any(String));
      const committedCExecutionId = cAttempt!.executionId;
      expect(
        await second.contexts.runBackground(organizationA, () =>
          second.prisma.client.execution.count(),
        ),
      ).toBe(3);
      expect(
        await second.contexts.runBackground(organizationA, () =>
          second.prisma.client.outboxEvent.count({ where: { aggregateType: 'Execution' } }),
        ),
      ).toBe(3);

      // The caller lost the response only after the atomic dispatch committed.
      // A newly leased worker recovers the durable association without creating
      // another execution or outbox request.
      clock.current = new Date(clock.now().getTime() + 30_001);
      const replayClaim = await first.claims.claimDue({
        limit: 1,
        owner: 'worker-replay',
        now: clock.now(),
        leaseMs: 30_000,
        reconciliationMs: 1_000,
      });
      expect(replayClaim).toHaveLength(1);
      await expect(
        second.contexts.runBackground(organizationA, () =>
          advanceSecond.tick({ runId: started.runId, leaseToken: recoveredLease.leaseToken }),
        ),
      ).rejects.toMatchObject({ code: WorkflowRunErrorCode.LEASE_MISMATCH });
      await first.contexts.runBackground(organizationA, () =>
        advanceFirst.tick({ runId: started.runId, leaseToken: replayClaim[0]!.leaseToken }),
      );
      snapshot = await first.contexts.runBackground(organizationA, () =>
        first.runs.findSnapshot(started.runId),
      );
      expect(snapshot!.nodeAttempts.find((attempt) => attempt.nodeId === 'c')?.executionId).toBe(
        committedCExecutionId,
      );
      expect(
        await second.contexts.runBackground(organizationA, () =>
          second.prisma.client.execution.count(),
        ),
      ).toBe(3);
      expect(
        await second.contexts.runBackground(organizationA, () =>
          second.prisma.client.outboxEvent.count({ where: { aggregateType: 'Execution' } }),
        ),
      ).toBe(3);

      await second.contexts.runBackground(organizationA, () =>
        second.prisma.client.execution.update({
          where: { id: cAttempt!.executionId! },
          data: { status: 'SUCCEEDED', finishedAt: clock.now() },
        }),
      );
      await second.contexts.runBackground(organizationA, () =>
        advanceSecond.tick({ runId: started.runId, leaseToken: replayClaim[0]!.leaseToken }),
      );
      snapshot = await second.contexts.runBackground(organizationA, () =>
        second.runs.findSnapshot(started.runId),
      );
      expect(snapshot?.run.status).toBe('SUCCEEDED');
      expect(snapshot?.nodeAttempts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nodeId: 'a', state: 'SUCCEEDED' }),
          expect.objectContaining({ nodeId: 'b', state: 'SUCCEEDED' }),
          expect.objectContaining({ nodeId: 'c', state: 'SUCCEEDED' }),
        ]),
      );
    });
  });
}

function organization(id: string, prefix: string) {
  return {
    id,
    slug: `${prefix}-${id}`,
    displayName: prefix,
    homeRegion: 'local',
  };
}

function session(
  url: string,
  organizationId: string,
  clock: MutableClock,
  versions: ReadonlyMap<string, string>,
  postCommitFault?: PostCommitDispatchFault,
): Session {
  const contexts = new TestBackgroundContextStore();
  const config = new ConfigService({
    DATABASE_URL: url,
    DEFAULT_ORGANIZATION_ID: organizationId,
    MINIO_ARTIFACTS_BUCKET: 'integration-artifacts',
  });
  const prisma = new PrismaService(config, new PrismaTransactionContext(), contexts);
  const unitOfWork = new PrismaUnitOfWork(prisma, new PrismaOutboxWriter(prisma));
  const mapper = new ExecutionMapper(config);
  const workflowExecutor = new WorkflowPipelineExecutorAdapter(
    { require: async () => undefined, requirePipeline: async () => undefined },
    controlledWorkloads(versions),
    new PreparedExecutionRequestService(
      new PrismaExecutionRepository(prisma, mapper),
      { requireActive: async (id) => ({ id }) } satisfies IConnectionReferenceProvider,
      unitOfWork,
      clock,
      { next: () => randomUUID() },
      'integration-artifacts',
      { driverMemory: '1g', executorMemory: '1g', executorCores: 1, maxCores: 1 },
    ),
    new PrismaExecutionReader(prisma, mapper),
    new PrismaWorkflowNodeAttemptExecutionRepository(prisma),
    unitOfWork,
  );
  const executor =
    postCommitFault === undefined
      ? workflowExecutor
      : new FaultInjectingWorkflowPipelineExecutor(workflowExecutor, postCommitFault);
  return {
    contexts,
    prisma,
    workflows: new PrismaWorkflowRepository(prisma, unitOfWork),
    schedules: new PrismaWorkflowScheduleRepository(prisma, unitOfWork),
    runs: new PrismaWorkflowRunRepository(prisma, unitOfWork),
    claims: new PrismaWorkflowRunClaimStore(prisma, unitOfWork),
    unitOfWork,
    executor,
  };
}

function controlledWorkloads(versions: ReadonlyMap<string, string>): IExecutableWorkloadProvider {
  return {
    resolveScript: async () => {
      throw new Error('The data-workflow integration only resolves pinned pipelines.');
    },
    resolve: async () => {
      throw new Error('The data-workflow integration only resolves pinned pipelines.');
    },
    resolvePipeline: async (pipelineId, versionNumber) => {
      const pipelineVersionId = versions.get(`${pipelineId}:${String(versionNumber)}`);
      if (pipelineVersionId === undefined) throw new Error('Missing controlled pipeline version.');
      return {
        workload: { kind: 'PIPELINE', pipelineId, pipelineVersionId, versionNumber },
        source: new Uint8Array(),
      };
    },
  };
}

async function createPipelines(
  target: Session,
  actor: WorkflowActor,
  labels: readonly string[],
): Promise<Readonly<Record<string, PipelineFixture>>> {
  const fixtures: Record<string, PipelineFixture> = {};
  await target.contexts.runBackground(actor.organizationId, async () => {
    for (const label of labels) {
      const id = randomUUID();
      const versionId = randomUUID();
      await target.prisma.client.pipeline.create({
        data: {
          id,
          name: `workflow-integration-${label}-${id}`,
          status: 'DRAFT',
          version: 1,
          graph: {},
          createdById: actor.identityId,
          createdByDisplayName: 'Integration',
        },
      });
      await target.prisma.client.pipelineVersion.create({
        data: { id: versionId, pipelineId: id, versionNumber: 1, graphSnapshot: {} },
      });
      fixtures[label] = { id, versionId };
    }
  });
  return fixtures;
}

function graphWithPipelines(pipelines: Readonly<Record<string, PipelineFixture>>): WorkflowGraph {
  const pipeline = (label: string): PipelineReference => ({
    pipelineId: pipelines[label]!.id,
    versionNumber: 1,
  });
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.type === 'PIPELINE' ? { ...node, ...pipeline(node.id) } : node,
    ),
  };
}

if (databaseUrl === undefined) {
  skippedSuite();
} else {
  const error = safetyError(databaseUrl);
  if (error === undefined) {
    enabledSuite(databaseUrl);
  } else {
    rejectedSuite(error);
  }
}

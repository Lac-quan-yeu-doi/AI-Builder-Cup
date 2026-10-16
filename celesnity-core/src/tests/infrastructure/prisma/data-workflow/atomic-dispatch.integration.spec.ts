import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

import { TestBackgroundContextStore } from '@tests/application/administration/background-principal.fixture';
import type { WorkflowNodeAttemptIdentity } from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import { PrismaWorkflowNodeAttemptExecutionRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-node-attempt-execution.repository';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaUnitOfWork } from '@infrastructure/prisma/prisma-unit-of-work';

const databaseUrl = process.env.DATA_WORKFLOW_TEST_DATABASE_URL;
const DATABASE_NAME = 'celesnity_data_workflow_task2_test';
const MIGRATION_NAME = '20260917090000_data_workflows';

interface Session {
  readonly contexts: TestBackgroundContextStore;
  readonly prisma: PrismaService;
  readonly attempts: PrismaWorkflowNodeAttemptExecutionRepository;
  readonly unitOfWork: PrismaUnitOfWork;
}

function safetyError(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'DATA_WORKFLOW_TEST_DATABASE_URL must be a valid PostgreSQL URL.';
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return 'DATA_WORKFLOW_TEST_DATABASE_URL must use a PostgreSQL URL.';
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    return 'DATA_WORKFLOW_TEST_DATABASE_URL must target a loopback host.';
  }
  if (url.pathname.replace(/^\//, '') !== DATABASE_NAME) {
    return `DATA_WORKFLOW_TEST_DATABASE_URL must target only ${DATABASE_NAME}.`;
  }
  if (url.searchParams.get('schema') !== 'celesnity_app') {
    return 'DATA_WORKFLOW_TEST_DATABASE_URL must select the celesnity_app schema.';
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

function session(url: string, organizationId: string): Session {
  const contexts = new TestBackgroundContextStore();
  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: url, DEFAULT_ORGANIZATION_ID: organizationId }),
    new PrismaTransactionContext(),
    contexts,
  );
  const unitOfWork = new PrismaUnitOfWork(prisma, new PrismaOutboxWriter(prisma));
  return {
    contexts,
    prisma,
    attempts: new PrismaWorkflowNodeAttemptExecutionRepository(prisma),
    unitOfWork,
  };
}

function skippedSuite(): void {
  describe.skip('Data Workflow atomic dispatch (disposable PostgreSQL)', () => {
    it('requires DATA_WORKFLOW_TEST_DATABASE_URL', () => undefined);
  });
}

function rejectedSuite(message: string): void {
  describe('Data Workflow atomic dispatch (disposable PostgreSQL)', () => {
    it('fails closed for an unsafe test database URL', () => {
      throw new Error(message);
    });
  });
}

function enabledSuite(url: string): void {
  describe('Data Workflow atomic dispatch (disposable PostgreSQL)', () => {
    const organizationId = randomUUID();
    let first: Session;
    let second: Session;

    beforeAll(async () => {
      await assertMigratedDisposableDatabase(url);
      first = session(url, organizationId);
      second = session(url, organizationId);
      await Promise.all([first.prisma.onModuleInit(), second.prisma.onModuleInit()]);
      await first.prisma.client.organization.create({
        data: {
          id: organizationId,
          slug: `atomic-dispatch-${organizationId}`,
          displayName: 'Atomic dispatch',
          homeRegion: 'local',
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

    it('serializes duplicate attempt delivery and retains one execution association', async () => {
      const workflowId = randomUUID();
      const versionId = randomUUID();
      const runId = randomUUID();
      const pipelineId = randomUUID();
      const pipelineVersionId = randomUUID();
      const executionId = randomUUID();
      const competingExecutionId = randomUUID();
      const now = new Date();
      const identity: WorkflowNodeAttemptIdentity = {
        organizationId,
        runId,
        nodeId: 'load-orders',
        attemptNumber: 1,
        leaseOwner: 'worker-1',
        leaseToken: '11111111-1111-4111-8111-111111111111',
      };

      await first.contexts.runBackground(organizationId, async () => {
        await first.prisma.client.dataWorkflow.create({
          data: {
            id: workflowId,
            name: 'Atomic dispatch workflow',
            draft: { nodes: [], edges: [] },
            revision: 1,
            paused: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        await first.prisma.client.dataWorkflowVersion.create({
          data: {
            id: versionId,
            workflowId,
            versionNumber: 1,
            graphSnapshot: { nodes: [], edges: [] },
            triggerSnapshot: {},
            publishedAt: now,
          },
        });
        await first.prisma.client.dataWorkflowRun.create({
          data: {
            id: runId,
            workflowId,
            versionId,
            actor: 'test',
            parameters: {},
            triggerContext: {},
            status: 'RUNNING',
            revision: 1,
            leaseOwner: identity.leaseOwner,
            leaseToken: identity.leaseToken,
            nextReconciliationAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        await first.prisma.client.pipeline.create({
          data: {
            id: pipelineId,
            name: `atomic-dispatch-${pipelineId}`,
            status: 'DRAFT',
            version: 1,
            graph: {},
            createdById: 'test',
            createdByDisplayName: 'Test',
          },
        });
        await first.prisma.client.pipelineVersion.create({
          data: { id: pipelineVersionId, pipelineId, versionNumber: 1, graphSnapshot: {} },
        });
        await first.prisma.client.execution.createMany({
          data: [executionId, competingExecutionId].map((id) => ({
            id,
            workloadKind: 'PIPELINE',
            workloadVersionNumber: 1,
            pipelineId,
            pipelineVersionId,
            resourceProfile: {},
            queuedAt: now,
            updatedAt: now,
          })),
        });
        await first.prisma.client.dataWorkflowNodeAttempt.create({
          data: {
            id: randomUUID(),
            runId,
            nodeId: identity.nodeId,
            attemptNumber: identity.attemptNumber,
            state: 'RUNNING',
            createdAt: now,
            updatedAt: now,
          },
        });
      });

      let releaseFirst: (() => void) | undefined;
      const firstCanFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstLocked: (() => void) | undefined;
      const lockHeld = new Promise<void>((resolve) => {
        firstLocked = resolve;
      });
      const dispatch = async (target: Session, id: string, waitForRelease: boolean) =>
        target.contexts.runBackground(organizationId, () =>
          target.unitOfWork.commit(async () => {
            const current = await target.attempts.lock(identity);
            if (current?.executionId !== undefined)
              return { associated: false, executionId: current.executionId };
            if (waitForRelease) {
              firstLocked?.();
              await firstCanFinish;
            }
            const associated = await target.attempts.associate(identity, id);
            return { associated, executionId: id };
          }),
        );

      const left = dispatch(first, executionId, true);
      await lockHeld;
      const right = dispatch(second, competingExecutionId, false);
      releaseFirst?.();
      const [leftResult, rightResult] = await Promise.all([left, right]);

      expect([leftResult, rightResult].filter((result) => result.associated)).toEqual([
        { associated: true, executionId },
      ]);
      expect([leftResult.executionId, rightResult.executionId]).toEqual([executionId, executionId]);
      await expect(
        first.contexts.runBackground(organizationId, () =>
          first.prisma.client.dataWorkflowNodeAttempt.create({
            data: {
              id: randomUUID(),
              runId,
              nodeId: identity.nodeId,
              attemptNumber: identity.attemptNumber,
              state: 'RUNNING',
              createdAt: now,
              updatedAt: now,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
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

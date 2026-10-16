import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

import { TestBackgroundContextStore } from '@tests/application/administration/background-principal.fixture';
import { PrismaWorkflowRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow.repository';
import { PrismaWorkflowScheduleRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule.repository';
import { PrismaWorkflowRunClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-run-claim.store';
import { PrismaWorkflowRunRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-run.repository';
import { PrismaWatchSourceRepository } from '@infrastructure/prisma/data-workflow-watch-source/prisma-watch-source.repository';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaUnitOfWork } from '@infrastructure/prisma/prisma-unit-of-work';

const databaseUrl = process.env.DATA_WORKFLOW_TEST_DATABASE_URL;
const DATABASE_NAME = 'celesnity_data_workflow_task2_test';
const MIGRATION_NAME = '20260918130000_data_workflow_watch_source_persistence';

interface Session {
  readonly contexts: TestBackgroundContextStore;
  readonly prisma: PrismaService;
  readonly workflows: PrismaWorkflowRepository;
  readonly schedules: PrismaWorkflowScheduleRepository;
  readonly runs: PrismaWorkflowRunRepository;
  readonly claims: PrismaWorkflowRunClaimStore;
  readonly watchSources: PrismaWatchSourceRepository;
}

interface WorkflowVersionFixture {
  readonly workflowId: string;
  readonly versionId: string;
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
    const result = await client.query<{
      readonly schemaPresent: boolean;
      readonly migrationsPresent: boolean;
      readonly migrationApplied: boolean;
    }>(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'celesnity_app') AS "schemaPresent",
        to_regclass('celesnity_app._prisma_migrations') IS NOT NULL AS "migrationsPresent",
        EXISTS (
          SELECT 1
          FROM "celesnity_app"."_prisma_migrations"
          WHERE migration_name = '${MIGRATION_NAME}' AND finished_at IS NOT NULL
        ) AS "migrationApplied"
    `);
    const state = result.rows[0];
    if (
      state?.schemaPresent !== true ||
      state.migrationsPresent !== true ||
      state.migrationApplied !== true
    ) {
      throw new Error(
        `Disposable data-workflow database must have completed migration ${MIGRATION_NAME}. Run the dedicated integration runner first.`,
      );
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
  const runs = new PrismaWorkflowRunRepository(prisma, unitOfWork);
  return {
    contexts,
    prisma,
    workflows: new PrismaWorkflowRepository(prisma, unitOfWork),
    schedules: new PrismaWorkflowScheduleRepository(prisma, unitOfWork),
    runs,
    claims: new PrismaWorkflowRunClaimStore(prisma, unitOfWork),
    watchSources: new PrismaWatchSourceRepository(prisma, unitOfWork),
  };
}

function skippedSuite(): void {
  describe.skip('Data Workflow persistence (disposable PostgreSQL)', () => {
    it('requires DATA_WORKFLOW_TEST_DATABASE_URL', () => undefined);
  });
}

function rejectedSuite(message: string): void {
  describe('Data Workflow persistence (disposable PostgreSQL)', () => {
    it('fails closed for an unsafe test database URL', () => {
      throw new Error(message);
    });
  });
}

function enabledSuite(url: string): void {
  describe('Data Workflow persistence (disposable PostgreSQL)', () => {
    const organizationA = randomUUID();
    const organizationB = randomUUID();
    let first: Session;
    let second: Session;
    let third: Session;

    const addWorkflowId = (): string => randomUUID();

    beforeAll(async () => {
      await assertMigratedDisposableDatabase(url);
      first = session(url, organizationA);
      second = session(url, organizationA);
      third = session(url, organizationA);
      await Promise.all([
        first.prisma.onModuleInit(),
        second.prisma.onModuleInit(),
        third.prisma.onModuleInit(),
      ]);
      await first.prisma.client.organization.createMany({
        data: [
          {
            id: organizationA,
            slug: `workflow-a-${organizationA}`,
            displayName: 'Workflow A',
            homeRegion: 'local',
          },
          {
            id: organizationB,
            slug: `workflow-b-${organizationB}`,
            displayName: 'Workflow B',
            homeRegion: 'local',
          },
        ],
      });
    });

    afterAll(async () => {
      if (first === undefined) return;
      await Promise.all([
        first.prisma.onApplicationShutdown(),
        second.prisma.onApplicationShutdown(),
        third.prisma.onApplicationShutdown(),
      ]);
    });

    const createWorkflowVersion = async (
      target: Session,
      organizationId: string,
      name: string,
    ): Promise<WorkflowVersionFixture> => {
      const workflowId = addWorkflowId();
      const versionId = randomUUID();
      const now = new Date();
      await target.contexts.runBackground(organizationId, async () => {
        await target.workflows.create({
          id: workflowId,
          organizationId,
          name,
          draft: { nodes: [], edges: [] },
          paused: false,
          now,
        });
        await target.workflows.publish(workflowId, 1, {
          id: versionId,
          graph: { nodes: [], edges: [] },
          trigger: { source: 'test' },
          publishedAt: now,
        });
      });
      return { workflowId, versionId };
    };

    it('hides and refuses updates to organization A rows from organization B', async () => {
      const { workflowId } = await createWorkflowVersion(first, organizationA, 'Scoped workflow');

      await expect(
        second.contexts.runBackground(organizationB, () => second.workflows.find(workflowId)),
      ).resolves.toBeUndefined();
      await expect(
        second.contexts.runBackground(organizationB, () =>
          second.workflows.saveDraft(workflowId, 2, {
            name: 'foreign update',
            draft: { nodes: [], edges: [] },
            paused: true,
            now: new Date(),
          }),
        ),
      ).resolves.toBe(false);
    });

    it('persists a baseline silently, durably deduplicates capture before advancing its checkpoint, and pins assignment delivery', async () => {
      const fixture = await createWorkflowVersion(first, organizationA, 'Watch source workflow');
      const sourceId = randomUUID();
      const serviceId = randomUUID();
      const subscriptionId = randomUUID();
      const baselineAt = new Date('2026-09-18T09:00:00.000Z');
      const notificationId = randomUUID();
      const assignmentId = randomUUID();
      const capture = {
        organizationId: organizationA,
        watchSourceId: sourceId,
        batch: {
          id: randomUUID(),
          captureKey: 'public\\u0000orders\\u0000baseline\\u0000next',
          capturedAt: baselineAt,
        },
        notification: {
          id: notificationId,
          relation: { schema: 'public', table: 'orders' },
          changeTypes: ['INSERT'],
          checkpointFingerprint: 'sha256:range',
          idempotencyKey: 'watch:orders:baseline:next',
          adapterKey: 'postgres-polling',
          adapterVersion: 'v1',
          capturedAt: baselineAt,
        },
        checkpoint: {
          from: 'baseline',
          through: 'next',
          expectedRevision: 1,
          advancedAt: baselineAt,
        },
        assignments: [
          {
            id: assignmentId,
            subscriptionId,
            workflowId: fixture.workflowId,
            workflowVersionId: fixture.versionId,
            now: baselineAt,
          },
        ],
      } as const;

      await first.contexts.runBackground(organizationA, async () => {
        await first.prisma.client.databaseService.create({
          data: {
            id: serviceId,
            name: `watch-source-${serviceId}`,
            connectorType: 'postgres',
            config: {},
            configSchemaVersion: 1,
            encryptedCredentialPayload: 'test-only',
            credentialSchemaVersion: 1,
            encryptionIv: 'test-only',
            encryptionAuthTag: 'test-only',
            encryptionKeyVersion: 'test-only',
          },
        });
        await first.watchSources.createSource({
          id: sourceId,
          organizationId: organizationA,
          databaseServiceId: serviceId,
          adapterKey: 'postgres-polling',
          adapterVersion: 'v1',
          trigger: {
            type: 'WATCH_SOURCE',
            mode: 'POLLING',
            databaseServiceId: serviceId,
            everySeconds: 600,
            relations: [
              {
                schema: 'public',
                table: 'orders',
                cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
              },
            ],
          },
          enabled: true,
          now: baselineAt,
        });
        await first.watchSources.createSubscription({
          id: subscriptionId,
          organizationId: organizationA,
          watchSourceId: sourceId,
          workflowId: fixture.workflowId,
          workflowVersionId: fixture.versionId,
          actor: 'publisher',
          now: baselineAt,
        });
        await first.watchSources.establishBaseline({
          id: randomUUID(),
          organizationId: organizationA,
          watchSourceId: sourceId,
          relation: { schema: 'public', table: 'orders' },
          checkpoint: 'baseline',
          establishedAt: baselineAt,
        });
        expect(
          await first.prisma.client.dataWorkflowWatchSourceNotification.count({
            where: { watchSourceId: sourceId },
          }),
        ).toBe(0);

        expect(await first.watchSources.recordCapture(capture)).toMatchObject({ duplicate: false });
        expect(await first.watchSources.recordCapture(capture)).toMatchObject({ duplicate: true });
        expect(
          await first.prisma.client.dataWorkflowWatchSourceNotification.count({
            where: { watchSourceId: sourceId },
          }),
        ).toBe(1);
        expect(
          await first.prisma.client.dataWorkflowWatchSourceCheckpoint.findFirst({
            where: { watchSourceId: sourceId, schemaName: 'public', tableName: 'orders' },
          }),
        ).toMatchObject({ opaqueCheckpoint: 'next', revision: 2 });
        await expect(
          first.watchSources.completeDelivery(assignmentId, false, baselineAt),
        ).resolves.toBe(false);
        expect(
          await first.prisma.client.dataWorkflowWatchSourceDeliveryAssignment.findUnique({
            where: { id: assignmentId },
          }),
        ).toMatchObject({ status: 'PENDING', workflowVersionId: fixture.versionId });

        await expect(
          first.watchSources.recordCapture({
            ...capture,
            batch: { ...capture.batch, id: randomUUID(), captureKey: 'stale-range' },
            notification: {
              ...capture.notification,
              id: randomUUID(),
              idempotencyKey: 'stale-range',
            },
            checkpoint: { ...capture.checkpoint },
          }),
        ).rejects.toThrow('checkpoint was changed concurrently');
        expect(
          await first.prisma.client.dataWorkflowWatchSourceNotification.count({
            where: { watchSourceId: sourceId },
          }),
        ).toBe(1);
      });
    });

    it('uses distinct PostgreSQL sessions so only one concurrent publication obtains a version', async () => {
      const workflowId = addWorkflowId();
      await first.contexts.runBackground(organizationA, () =>
        first.workflows.create({
          id: workflowId,
          organizationId: organizationA,
          name: 'Concurrent publication',
          draft: { nodes: [], edges: [] },
          paused: false,
          now: new Date(),
        }),
      );

      const publishedAt = new Date();
      const [left, right] = await Promise.all([
        first.contexts.runBackground(organizationA, () =>
          first.workflows.publish(workflowId, 1, {
            id: randomUUID(),
            graph: { nodes: [], edges: [] },
            trigger: { source: 'test' },
            publishedAt,
          }),
        ),
        second.contexts.runBackground(organizationA, () =>
          second.workflows.publish(workflowId, 1, {
            id: randomUUID(),
            graph: { nodes: [], edges: [] },
            trigger: { source: 'test' },
            publishedAt,
          }),
        ),
      ]);

      expect([left, right].filter((value) => value !== false)).toHaveLength(1);
      expect(await first.prisma.client.dataWorkflowVersion.count({ where: { workflowId } })).toBe(
        1,
      );
    });

    it('rejects direct deletion of an unreferenced immutable version', async () => {
      const fixture = await createWorkflowVersion(first, organizationA, 'Immutable version');

      await expect(
        first.contexts.runBackground(organizationA, () =>
          first.prisma.client.dataWorkflowVersion.delete({ where: { id: fixture.versionId } }),
        ),
      ).rejects.toMatchObject({ code: 'P2039' });
    });

    it('persists only schedule state, pins the published version, supersedes on republish, and fences tenant/CAS updates', async () => {
      const initial = await createWorkflowVersion(first, organizationA, 'Scheduled workflow');
      const dueAt = new Date('2026-09-18T10:00:00.000Z');
      const anchorAt = new Date('2026-09-18T09:00:00.000Z');
      await first.contexts.runBackground(organizationA, () =>
        first.schedules.synchronizePublication({
          id: randomUUID(),
          organizationId: organizationA,
          workflowId: initial.workflowId,
          versionId: initial.versionId,
          actor: 'publishing-identity',
          triggerKind: 'INTERVAL',
          nextDueAt: dueAt,
          intervalAnchorAt: anchorAt,
          now: dueAt,
        }),
      );
      const active = await first.contexts.runBackground(organizationA, () =>
        first.schedules.findCurrent(initial.workflowId),
      );
      expect(active).toMatchObject({
        workflowId: initial.workflowId,
        versionId: initial.versionId,
        actor: 'publishing-identity',
        triggerKind: 'INTERVAL',
        nextDueAt: dueAt,
        intervalAnchorAt: anchorAt,
        revision: 1,
        enabled: true,
      });
      await expect(
        second.contexts.runBackground(organizationB, () =>
          second.schedules.findCurrent(initial.workflowId),
        ),
      ).resolves.toBeUndefined();
      await expect(
        second.contexts.runBackground(organizationB, () =>
          second.schedules.saveState(active!.id, 1, { enabled: false, now: dueAt }),
        ),
      ).resolves.toBe(false);
      await expect(
        first.contexts.runBackground(organizationA, () =>
          first.schedules.saveState(active!.id, 1, {
            enabled: true,
            nextDueAt: dueAt,
            now: dueAt,
          }),
        ),
      ).resolves.toBe(true);
      await expect(
        first.contexts.runBackground(organizationA, () =>
          first.schedules.saveState(active!.id, 1, { enabled: true, now: dueAt }),
        ),
      ).resolves.toBe(false);

      const nextVersionId = randomUUID();
      const republishedAt = new Date('2026-09-18T11:00:00.000Z');
      const republished = await first.contexts.runBackground(organizationA, () =>
        first.workflows.publish(initial.workflowId, 2, {
          id: nextVersionId,
          graph: { nodes: [], edges: [] },
          trigger: { triggerNodeId: 'trigger', config: { type: 'CALENDAR' } },
          publishedAt: republishedAt,
        }),
      );
      expect(republished).not.toBe(false);
      await first.contexts.runBackground(organizationA, () =>
        first.schedules.synchronizePublication({
          id: randomUUID(),
          organizationId: organizationA,
          workflowId: initial.workflowId,
          versionId: nextVersionId,
          actor: 'publishing-identity',
          triggerKind: 'CALENDAR',
          nextDueAt: new Date('2026-09-19T07:00:00.000Z'),
          now: republishedAt,
        }),
      );
      const schedules = await first.contexts.runBackground(organizationA, () =>
        first.prisma.client.dataWorkflowSchedule.findMany({
          where: { workflowId: initial.workflowId },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(schedules).toHaveLength(2);
      expect(schedules[0]).toMatchObject({ versionId: initial.versionId, enabled: false });
      expect(schedules[0]?.supersededAt).toEqual(republishedAt);
      expect(schedules[1]).toMatchObject({ versionId: nextVersionId, enabled: true });
    });

    it('uses the global due-schedule index without selecting through a tenant partition', async () => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('SET enable_seqscan = off');
        const result = await client.query<{ readonly 'QUERY PLAN': string }>(`
          EXPLAIN (COSTS OFF)
          SELECT id
          FROM "celesnity_app"."data_workflow_schedules"
          WHERE enabled = true
            AND superseded_at IS NULL
            AND next_due_at <= clock_timestamp()
          ORDER BY next_due_at, id
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `);
        expect(result.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
          'data_workflow_schedules_global_due_claim_idx',
        );
      } finally {
        await client.end();
      }
    });

    it('rejects a run whose version belongs to a different workflow', async () => {
      const left = await createWorkflowVersion(first, organizationA, 'Run workflow A');
      const right = await createWorkflowVersion(first, organizationA, 'Run workflow B');

      await expect(
        first.contexts.runBackground(organizationA, () =>
          first.prisma.client.dataWorkflowRun.create({
            data: {
              id: randomUUID(),
              workflowId: left.workflowId,
              versionId: right.versionId,
              actor: 'tester',
              parameters: {},
              triggerContext: {},
              status: 'QUEUED',
              revision: 1,
              nextReconciliationAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('claims once, then reclaims only after the persisted lease expires across distinct sessions', async () => {
      const fixture = await createWorkflowVersion(first, organizationA, 'Claim once');
      const now = new Date();
      await first.contexts.runBackground(organizationA, () =>
        first.runs.createRun({
          id: randomUUID(),
          organizationId: organizationA,
          workflowId: fixture.workflowId,
          versionId: fixture.versionId,
          actor: 'tester',
          parameters: {},
          triggerContext: {},
          now,
        }),
      );

      const [left, right] = await Promise.all([
        first.claims.claimDue({
          limit: 1,
          owner: 'worker-left',
          now,
          leaseMs: 30_000,
          reconciliationMs: 5_000,
        }),
        second.claims.claimDue({
          limit: 1,
          owner: 'worker-right',
          now,
          leaseMs: 30_000,
          reconciliationMs: 5_000,
        }),
      ]);
      expect(left.length + right.length).toBe(1);
      const firstClaim = [...left, ...right][0];
      const reclaimed = await third.claims.claimDue({
        limit: 1,
        owner: 'worker-recovery',
        now: new Date(now.getTime() + 30_001),
        leaseMs: 30_000,
        reconciliationMs: 5_000,
      });
      expect(reclaimed).toEqual([
        expect.objectContaining({ runId: firstClaim?.runId, organizationId: organizationA }),
      ]);
      expect(reclaimed[0]?.leaseToken).not.toBe(firstClaim?.leaseToken);
    });

    it('uses the global due-claim index for bounded cross-tenant work discovery', async () => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('SET enable_seqscan = off');
        const result = await client.query<{ readonly 'QUERY PLAN': string }>(`
          EXPLAIN (COSTS OFF)
          SELECT id
          FROM "celesnity_app"."data_workflow_runs"
          WHERE (
            status = 'QUEUED' AND next_reconciliation_at <= clock_timestamp()
          ) OR (
            status = 'RUNNING' AND (
              lease_expires_at <= clock_timestamp()
              OR (lease_owner = 'explain-worker' AND next_reconciliation_at <= clock_timestamp())
            )
          )
          ORDER BY next_reconciliation_at, created_at, id
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `);
        expect(result.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
          'data_workflow_runs_global_due_claim_idx',
        );
      } finally {
        await client.end();
      }
    });

    it('rolls back an execution insert and its node association together', async () => {
      const fixture = await createWorkflowVersion(first, organizationA, 'Atomic dispatch');
      const runId = randomUUID();
      const pipelineId = randomUUID();
      const pipelineVersionId = randomUUID();
      const executionId = randomUUID();
      const attemptId = randomUUID();
      const now = new Date();
      await first.contexts.runBackground(organizationA, async () => {
        await first.prisma.client.pipeline.create({
          data: {
            id: pipelineId,
            name: `data-workflow-task2-${pipelineId}`,
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

        await expect(
          new PrismaUnitOfWork(first.prisma, new PrismaOutboxWriter(first.prisma)).commit(
            async () => {
              await first.prisma.client.execution.create({
                data: {
                  id: executionId,
                  workloadKind: 'PIPELINE',
                  workloadVersionNumber: 1,
                  pipelineId,
                  pipelineVersionId,
                  resourceProfile: {},
                  queuedAt: now,
                  updatedAt: now,
                },
              });
              const run = await first.runs.createRun({
                id: runId,
                organizationId: organizationA,
                workflowId: fixture.workflowId,
                versionId: fixture.versionId,
                actor: 'tester',
                parameters: {},
                triggerContext: {},
                now,
              });
              if (run === false) throw new Error('Expected workflow run creation to succeed.');
              await first.runs.saveTransition(run, 1, {
                status: 'RUNNING',
                updatedAt: now,
                nodeAttempts: [
                  {
                    id: attemptId,
                    organizationId: organizationA,
                    runId,
                    nodeId: 'pipeline',
                    attemptNumber: 1,
                    state: 'RUNNING',
                    executionId,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
                edgeStates: [],
              });
              throw new Error('force transaction rollback');
            },
          ),
        ).rejects.toThrow('force transaction rollback');
      });

      expect(
        await first.prisma.client.execution.findUnique({ where: { id: executionId } }),
      ).toBeNull();
      expect(
        await first.prisma.client.dataWorkflowNodeAttempt.findUnique({ where: { id: attemptId } }),
      ).toBeNull();
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

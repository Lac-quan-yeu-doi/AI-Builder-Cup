import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { PrismaWorkflowRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow.repository';
import { PrismaWorkflowRunRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-run.repository';
import { PrismaWorkflowScheduleRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule.repository';
import {
  isOrganizationScopedModel,
  scopePrismaArguments,
} from '@infrastructure/prisma/prisma.service';

const ORGANIZATION_A = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_B = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';

const now = new Date('2026-09-17T09:00:00.000Z');

function unitOfWork(): IUnitOfWork {
  return {
    commit: async (work) => work({ record: jest.fn() }),
  };
}

describe('Data Workflow Prisma persistence contracts', () => {
  it('registers every workflow record for organization scoping', () => {
    for (const model of [
      'DataWorkflow',
      'DataWorkflowVersion',
      'DataWorkflowSchedule',
      'DataWorkflowRun',
      'DataWorkflowNodeAttempt',
      'DataWorkflowEdgeState',
      'DataWorkflowRetryAcknowledgement',
    ]) {
      expect(isOrganizationScopedModel(model)).toBe(true);
    }

    expect(
      scopePrismaArguments('findUnique', { where: { id: WORKFLOW_ID } }, ORGANIZATION_B),
    ).toEqual({ where: { id: WORKFLOW_ID, organizationId: ORGANIZATION_B } });
  });

  it('returns false when a tenant-scoped draft revision no longer matches', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaWorkflowRepository(
      { client: { dataWorkflow: { updateMany } } } as never,
      unitOfWork(),
    );

    await expect(
      repository.saveDraft(WORKFLOW_ID, 4, {
        name: 'changed',
        draft: { nodes: [], edges: [] },
        paused: true,
        now,
      }),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: WORKFLOW_ID, revision: 4 },
      data: expect.objectContaining({ revision: 5, name: 'changed', paused: true }),
    });
  });

  it('allocates one immutable version when simultaneous publications use one revision', async () => {
    let revision = 7;
    let publishedVersion = 3;
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      ...data,
      organizationId: ORGANIZATION_A,
    }));
    const findFirst = jest.fn().mockImplementation(async () => ({
      id: WORKFLOW_ID,
      organizationId: ORGANIZATION_A,
      name: 'Daily production flow',
      draft: { nodes: [], edges: [] },
      revision,
      publishedVersion,
      paused: false,
      createdAt: now,
      updatedAt: now,
    }));
    const updateMany = jest.fn().mockImplementation(async ({ where, data }) => {
      if (where.revision !== revision) return { count: 0 };
      revision = data.revision;
      publishedVersion = data.publishedVersion;
      return { count: 1 };
    });
    const repository = new PrismaWorkflowRepository(
      {
        organizationId: ORGANIZATION_A,
        client: {
          dataWorkflow: { findFirst, updateMany },
          dataWorkflowVersion: { create },
        },
      } as never,
      unitOfWork(),
    );

    const snapshot = {
      id: VERSION_ID,
      graph: { nodes: [{ id: 'trigger', type: 'TRIGGER' as const }], edges: [] },
      trigger: { source: 'manual' },
      publishedAt: now,
    };
    const [first, second] = await Promise.all([
      repository.publish(WORKFLOW_ID, 7, snapshot),
      repository.publish(WORKFLOW_ID, 7, { ...snapshot, id: RUN_ID }),
    ]);

    expect([first, second]).toEqual(expect.arrayContaining([false, expect.any(Object)]));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workflowId: WORKFLOW_ID, versionNumber: 4 }),
      }),
    );
  });

  it('supersedes the previous automatic schedule and pins a new published version', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const repository = new PrismaWorkflowScheduleRepository(
      { client: { dataWorkflowSchedule: { updateMany, create } } } as never,
      unitOfWork(),
    );

    await repository.synchronizePublication({
      id: RUN_ID,
      organizationId: ORGANIZATION_A,
      workflowId: WORKFLOW_ID,
      versionId: VERSION_ID,
      actor: 'publishing-identity',
      triggerKind: 'INTERVAL',
      nextDueAt: new Date('2026-09-17T09:01:00.000Z'),
      intervalAnchorAt: new Date('2026-09-17T09:00:00.000Z'),
      now,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { workflowId: WORKFLOW_ID, enabled: true, supersededAt: null },
      data: expect.objectContaining({ enabled: false, supersededAt: now }),
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: RUN_ID,
        organizationId: ORGANIZATION_A,
        workflowId: WORKFLOW_ID,
        versionId: VERSION_ID,
        actor: 'publishing-identity',
        triggerKind: 'INTERVAL',
      }),
    });
  });

  it('disables automatic scheduling for a manual-only publication without creating mutable config', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn();
    const repository = new PrismaWorkflowScheduleRepository(
      { client: { dataWorkflowSchedule: { updateMany, create } } } as never,
      unitOfWork(),
    );

    await repository.synchronizePublication({
      id: RUN_ID,
      organizationId: ORGANIZATION_A,
      workflowId: WORKFLOW_ID,
      versionId: VERSION_ID,
      actor: 'publishing-identity',
      now,
    });

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('uses a schedule revision compare-and-set for mutable scheduler state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaWorkflowScheduleRepository(
      { client: { dataWorkflowSchedule: { updateMany } } } as never,
      unitOfWork(),
    );

    await expect(
      repository.saveState(RUN_ID, 4, {
        enabled: true,
        nextDueAt: new Date('2026-09-17T09:01:00.000Z'),
        now,
      }),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RUN_ID, revision: 4, supersededAt: null } }),
    );
  });

  it('claims a due run with a lease and rejects a foreign release', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const queryRaw = jest.fn().mockResolvedValue([{ id: RUN_ID }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: RUN_ID,
        organizationId: ORGANIZATION_A,
        workflowId: WORKFLOW_ID,
        versionId: VERSION_ID,
        actor: 'user-a',
        delegation: null,
        parameters: {},
        triggerContext: {},
        status: 'QUEUED',
        revision: 1,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const repository = new PrismaWorkflowRunRepository(
      {
        organizationId: ORGANIZATION_A,
        client: {
          $queryRaw: queryRaw,
          dataWorkflowRun: { findMany, updateMany },
        },
      } as never,
      unitOfWork(),
    );

    const claimed = await repository.claimDue(1, 'worker-a', now, 30_000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toEqual(
      expect.objectContaining({ status: 'RUNNING', leaseOwner: 'worker-a' }),
    );
    await expect(
      repository.releaseClaim(RUN_ID, 'worker-b', claimed[0]!.leaseToken!),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ leaseOwner: 'worker-b' }) }),
    );
  });

  it('rejects an expired lease fence before a worker transition can mutate the run', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const updateMany = jest.fn();
    const repository = new PrismaWorkflowRunRepository(
      { client: { $queryRaw: queryRaw, dataWorkflowRun: { updateMany } } } as never,
      unitOfWork(),
    );
    const run = {
      id: RUN_ID,
      organizationId: ORGANIZATION_A,
      workflowId: WORKFLOW_ID,
      versionId: VERSION_ID,
      actor: 'user-a',
      parameters: {},
      triggerContext: {},
      status: 'RUNNING' as const,
      revision: 1,
      leaseOwner: 'worker-a',
      leaseToken: '66666666-6666-4666-8666-666666666666',
      leaseExpiresAt: new Date(now.getTime() - 1),
      nextReconciliationAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      repository.saveTransition(
        run,
        1,
        { status: 'RUNNING', updatedAt: now, nodeAttempts: [], edgeStates: [] },
        { owner: 'worker-a', token: run.leaseToken },
      ),
    ).resolves.toBe(false);

    expect(updateMany).not.toHaveBeenCalled();
    const query = queryRaw.mock.calls[0]?.[0] as { readonly strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('lease_expires_at > clock_timestamp()');
  });

  it.each([
    {
      label: 'node attempt',
      transition: {
        nodeAttempts: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            organizationId: ORGANIZATION_A,
            runId: '77777777-7777-4777-8777-777777777777',
            nodeId: 'node-a',
            attemptNumber: 1,
            state: 'RUNNING' as const,
            createdAt: now,
            updatedAt: now,
          },
        ],
        edgeStates: [],
      },
    },
    {
      label: 'edge state',
      transition: {
        nodeAttempts: [],
        edgeStates: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            organizationId: ORGANIZATION_A,
            runId: '99999999-9999-4999-8999-999999999999',
            edgeId: 'edge-a',
            state: 'PENDING' as const,
            updatedAt: now,
          },
        ],
      },
    },
  ])(
    'rejects a $label assigned to a different run before changing the run',
    async ({ transition }) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repository = new PrismaWorkflowRunRepository(
        { client: { dataWorkflowRun: { updateMany } } } as never,
        unitOfWork(),
      );
      const run = {
        id: RUN_ID,
        organizationId: ORGANIZATION_A,
        workflowId: WORKFLOW_ID,
        versionId: VERSION_ID,
        actor: 'user-a',
        parameters: {},
        triggerContext: {},
        status: 'QUEUED' as const,
        revision: 1,
        nextReconciliationAt: now,
        createdAt: now,
        updatedAt: now,
      };

      expect(() =>
        repository.saveTransition(run, 1, {
          status: 'RUNNING',
          updatedAt: now,
          ...transition,
        }),
      ).toThrow('Data workflow transition children must belong to the transitioned run.');
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it('persists a retry acknowledgement with its linked retry attempt in one transition', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    const repository = new PrismaWorkflowRunRepository(
      {
        client: {
          dataWorkflowRun: { updateMany },
          dataWorkflowNodeAttempt: { upsert },
          dataWorkflowEdgeState: { upsert: jest.fn() },
          dataWorkflowRetryAcknowledgement: { create },
        },
      } as never,
      unitOfWork(),
    );
    const run = {
      id: RUN_ID,
      organizationId: ORGANIZATION_A,
      workflowId: WORKFLOW_ID,
      versionId: VERSION_ID,
      actor: 'initiating-actor',
      parameters: {},
      triggerContext: {},
      status: 'FAILED' as const,
      revision: 4,
      nextReconciliationAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const retryAttempt = {
      id: '66666666-6666-4666-8666-666666666666',
      organizationId: ORGANIZATION_A,
      runId: RUN_ID,
      nodeId: 'load',
      attemptNumber: 2,
      state: 'RUNNING' as const,
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      repository.saveTransition(run, 4, {
        status: 'QUEUED',
        updatedAt: now,
        nodeAttempts: [retryAttempt],
        edgeStates: [],
        retryAcknowledgements: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            organizationId: ORGANIZATION_A,
            runId: RUN_ID,
            nodeAttemptId: retryAttempt.id,
            nodeId: retryAttempt.nodeId,
            attemptNumber: retryAttempt.attemptNumber,
            approvedBy: 'approving-actor',
            acknowledgementSignal: true,
            purpose: 'DUPLICATE_APPEND_WRITE_RISK',
            acknowledgedAt: now,
          },
        ],
      }),
    ).resolves.toBe(true);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: retryAttempt.id, nodeId: 'load', attemptNumber: 2 }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: RUN_ID,
          nodeAttemptId: retryAttempt.id,
          approvedBy: 'approving-actor',
          acknowledgementSignal: true,
          purpose: 'DUPLICATE_APPEND_WRITE_RISK',
        }),
      }),
    );
    expect(run.actor).toBe('initiating-actor');
  });
});

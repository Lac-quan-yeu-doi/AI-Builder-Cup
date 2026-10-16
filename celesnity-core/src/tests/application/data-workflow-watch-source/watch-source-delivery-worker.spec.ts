import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { WatchSourceDeliveryWorkerService } from '@application/data-workflow-watch-source/watch-source-delivery-worker.service';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type {
  DataWorkflowWatchSourceDeliveryAssignment,
  DataWorkflowWatchSourceNotification,
  DataWorkflowWatchSourceSubscription,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';

const ORG = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';
const WORKFLOW = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const RUN = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-09-18T09:00:00.000Z');

describe('Watch Source delivery worker', () => {
  it('coalesces one batch into one pinned run and keeps assignments dispatched', async () => {
    const assignments = [assignment('1', 'token-1'), assignment('2', 'token-2')];
    const createRun = jest.fn().mockResolvedValue({ id: RUN });
    const attach = jest.fn().mockResolvedValue(true);
    const repository = repositoryFake(assignments, createNotifications(), attach);
    const service = serviceFor(repository, {
      findActive: jest.fn().mockResolvedValue(undefined),
      createRun,
    });

    const result = await service.dispatchOnce();

    expect(result).toMatchObject({ claimed: 2, dispatched: 2, deferred: 0 });
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(createRun.mock.calls[0]![0]).toMatchObject({
      workflowId: WORKFLOW,
      versionId: VERSION,
      actor: 'publisher',
      parameters: {},
      triggerContext: {
        type: 'WATCH_SOURCE',
        watchSourceId: SOURCE,
        notifications: [
          expect.objectContaining({
            id: expect.any(String),
            relation: { schema: 'public', table: 'orders' },
          }),
          expect.objectContaining({
            id: expect.any(String),
            relation: { schema: 'public', table: 'orders' },
          }),
        ],
      },
    });
    expect(createRun.mock.calls[0]![0].triggerContext).not.toHaveProperty('rows');
    expect(attach).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRunId: RUN, owner: 'worker' }),
    );
  });

  it('acknowledges only successful runs and blocks failed runs', async () => {
    const succeeded = assignment('3', undefined, RUN);
    const failed = assignment('4', undefined, '66666666-6666-4666-8666-666666666666');
    const complete = jest.fn().mockResolvedValue(true);
    const block = jest.fn().mockResolvedValue(true);
    const repository = repositoryFake([], createNotifications(), jest.fn(), {
      claimDueAssignments: jest.fn().mockResolvedValue([]),
      listDispatchedAssignments: jest.fn().mockResolvedValue([succeeded, failed]),
      completeDeliveryForRun: complete,
      blockDeliveryForRun: block,
    });
    const service = serviceFor(repository, {
      find: jest
        .fn()
        .mockResolvedValueOnce({ status: 'SUCCEEDED' })
        .mockResolvedValueOnce({ status: 'FAILED' }),
    });

    const result = await service.dispatchOnce();

    expect(result).toMatchObject({ claimed: 0, delivered: 1, blocked: 1 });
    expect(complete).toHaveBeenCalledWith(succeeded.id, RUN, NOW);
    expect(block).toHaveBeenCalledWith(failed.id, failed.workflowRunId, NOW);
  });
});

function serviceFor(
  repository: unknown,
  runs: Record<string, jest.Mock>,
): WatchSourceDeliveryWorkerService {
  const workflows = {
    find: jest.fn().mockResolvedValue({
      id: WORKFLOW,
      organizationId: ORG,
      name: 'Orders workflow',
      draft: { nodes: [], edges: [] },
      revision: 1,
      publishedVersion: 1,
      paused: false,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    findVersionById: jest.fn().mockResolvedValue({
      id: VERSION,
      organizationId: ORG,
      workflowId: WORKFLOW,
      versionNumber: 1,
      graph: { nodes: [], edges: [] },
      trigger: { type: 'WATCH_SOURCE' },
      publishedAt: NOW,
    }),
  } as unknown as IWorkflowRepository;
  const access = {
    require: jest.fn(),
    requirePipeline: jest.fn(),
  } as unknown as IWorkflowAccess;
  const contexts = {
    runBackground: jest.fn((_organizationId: string, work: () => unknown) => work()),
  } as unknown as AuthenticatedContextStore;
  return new WatchSourceDeliveryWorkerService(
    repository as IWatchSourceRepository,
    workflows,
    { findActive: jest.fn(), ...runs } as unknown as IWorkflowRunRepository,
    access,
    contexts,
    { commit: async (work) => work({ record: jest.fn() }) },
    clock(),
    { next: () => 'worker' },
    { claimBatchSize: 10, leaseMs: 30_000, reconciliationBatchSize: 10 },
  );
}

function repositoryFake(
  assignments: readonly DataWorkflowWatchSourceDeliveryAssignment[],
  notifications: readonly DataWorkflowWatchSourceNotification[],
  attach: jest.Mock,
  overrides: Record<string, jest.Mock> = {},
): IWatchSourceRepository {
  const subscription: DataWorkflowWatchSourceSubscription = {
    id: '77777777-7777-4777-8777-777777777777',
    organizationId: ORG,
    watchSourceId: SOURCE,
    workflowId: WORKFLOW,
    workflowVersionId: VERSION,
    actor: 'publisher',
    enabled: true,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
  return {
    claimDueAssignments: jest.fn().mockResolvedValue(assignments),
    findSubscription: jest.fn().mockResolvedValue(subscription),
    findNotification: jest.fn((organizationId: string, id: string) =>
      Promise.resolve(
        notifications.find((item) => item.organizationId === organizationId && item.id === id),
      ),
    ),
    releaseClaim: jest.fn().mockResolvedValue(true),
    attachAssignmentsToRun: attach,
    listDispatchedAssignments: jest.fn().mockResolvedValue([]),
    completeDeliveryForRun: jest.fn().mockResolvedValue(false),
    blockDeliveryForRun: jest.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as IWatchSourceRepository;
}

function assignment(
  suffix: string,
  token?: string,
  workflowRunId?: string,
): DataWorkflowWatchSourceDeliveryAssignment {
  return {
    id: `88888888-8888-4888-8888-${suffix.padStart(12, '0')}`,
    organizationId: ORG,
    subscriptionId: '77777777-7777-4777-8777-777777777777',
    notificationId: `99999999-9999-4999-8999-${suffix.padStart(12, '0')}`,
    workflowId: WORKFLOW,
    workflowVersionId: VERSION,
    workflowRunId,
    status: workflowRunId === undefined ? 'CLAIMED' : 'DISPATCHED',
    revision: 1,
    leaseOwner: token === undefined ? undefined : 'worker',
    leaseToken: token,
    leaseExpiresAt: token === undefined ? undefined : new Date(NOW.getTime() + 30_000),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createNotifications(): readonly DataWorkflowWatchSourceNotification[] {
  return ['1', '2', '3', '4'].map((suffix) => ({
    id: `99999999-9999-4999-8999-${suffix.padStart(12, '0')}`,
    organizationId: ORG,
    watchSourceId: SOURCE,
    batchId: `aaaaaaaa-aaaa-4aaa-8aaa-${suffix.padStart(12, '0')}`,
    relation: { schema: 'public', table: 'orders' },
    changeTypes: ['INSERT', 'UPDATE'],
    checkpointFingerprint: 'sha256:metadata',
    idempotencyKey: `watch:${suffix}`,
    adapterKey: 'POSTGRESQL_POLLING',
    adapterVersion: '1',
    capturedAt: NOW,
  }));
}

function clock(): IClock {
  return { now: () => NOW };
}

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { EstablishWatchSourceBaselineUseCase } from '@application/data-workflow-watch-source/establish-watch-source-baseline.use-case';
import type { IWatchSourcePollingAdapter } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter';
import type {
  CaptureWatchSourceNotification,
  EstablishWatchSourceBaseline,
  IWatchSourceRepository,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { RecordWatchSourceCaptureUseCase } from '@application/data-workflow-watch-source/record-watch-source-capture.use-case';
import { WatchSourcePollingWorkerService } from '@application/data-workflow-watch-source/watch-source-polling-worker.service';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type {
  CreateDataWorkflowWatchSource,
  CreateDataWorkflowWatchSourceSubscription,
  DataWorkflowWatchSource,
  DataWorkflowWatchSourceCheckpoint,
  DataWorkflowWatchSourceDeliveryAssignment,
  DataWorkflowWatchSourceSubscription,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-18T09:00:00.000Z');

describe('Watch Source polling worker', () => {
  it('baselines silently, then records metadata-only capture in the source tenant', async () => {
    const repository = new FakeRepository();
    const adapter: IWatchSourcePollingAdapter = {
      adapterKey: 'POSTGRESQL_POLLING',
      adapterVersion: '1',
      connectorType: 'POSTGRESQL',
      establishBaseline: jest.fn().mockResolvedValue('watch:v1:baseline'),
      poll: jest.fn().mockResolvedValue({
        fromCheckpoint: 'watch:v1:baseline',
        throughCheckpoint: 'watch:v1:next',
        fingerprint: 'sha256:range',
        changeTypes: ['INSERT', 'UPDATE'],
      }),
    };
    const worker = new WatchSourcePollingWorkerService(
      repository,
      { requireVerified: jest.fn().mockResolvedValue({ connectorType: 'POSTGRESQL' }) },
      { require: jest.fn().mockReturnValue(adapter) },
      {
        runBackground: jest.fn((organizationId: string, work: () => unknown) => {
          repository.contextOrganizations.push(organizationId);
          return work();
        }),
      } as unknown as AuthenticatedContextStore,
      new EstablishWatchSourceBaselineUseCase(repository, clock(), ids()),
      new RecordWatchSourceCaptureUseCase(repository, clock(), ids()),
      clock(),
      ids(),
      { claimBatchSize: 1, leaseMs: 30_000, pollLimit: 100, timeoutMs: 10_000 },
    );

    const first = await worker.dispatchOnce();
    expect(first).toMatchObject({ claimed: 1, baselined: 1, captured: 0, unchanged: 0, failed: 0 });
    expect(repository.notifications).toHaveLength(0);
    expect(repository.contextOrganizations).toEqual([ORGANIZATION_ID]);

    const second = await worker.dispatchOnce();
    expect(second).toMatchObject({
      claimed: 1,
      baselined: 0,
      captured: 1,
      unchanged: 0,
      failed: 0,
    });
    expect(repository.notifications).toHaveLength(1);
    expect(repository.notifications[0]).toMatchObject({
      notification: expect.not.objectContaining({ sourceRow: expect.anything() }),
      checkpoint: { through: 'watch:v1:next' },
    });
    expect(repository.released).toHaveLength(2);
    expect(repository.completed).toHaveLength(2);
    expect(adapter.poll).toHaveBeenCalledTimes(1);
  });
});

class FakeRepository implements IWatchSourceRepository {
  public readonly notifications: CaptureWatchSourceNotification[] = [];
  public readonly released: string[] = [];
  public readonly completed: string[] = [];
  public readonly contextOrganizations: string[] = [];
  private checkpoint: DataWorkflowWatchSourceCheckpoint | undefined;
  private claimCount = 0;

  public async synchronizePublication(): Promise<void> {}
  public async health() {
    return undefined;
  }
  public async retryBlocked() {
    return 0;
  }

  public async createSource(
    _input: CreateDataWorkflowWatchSource,
  ): Promise<DataWorkflowWatchSource> {
    throw new Error('not used');
  }
  public async createSubscription(
    _input: CreateDataWorkflowWatchSourceSubscription,
  ): Promise<DataWorkflowWatchSourceSubscription> {
    throw new Error('not used');
  }
  public async findActiveSubscriptions(
    organizationId: string,
    _watchSourceId: string,
  ): Promise<readonly DataWorkflowWatchSourceSubscription[]> {
    return [
      {
        id: '55555555-5555-4555-8555-555555555555',
        organizationId,
        watchSourceId: SOURCE_ID,
        workflowId: WORKFLOW_ID,
        workflowVersionId: VERSION_ID,
        actor: 'publisher',
        enabled: true,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
  }
  public async findSubscription(): Promise<DataWorkflowWatchSourceSubscription | undefined> {
    return undefined;
  }
  public async findNotification() {
    return undefined;
  }
  public async listEnabledSources(): Promise<readonly DataWorkflowWatchSource[]> {
    return [];
  }
  public async findCheckpoint(): Promise<DataWorkflowWatchSourceCheckpoint | undefined> {
    return this.checkpoint;
  }
  public async claimDueSources(): Promise<readonly DataWorkflowWatchSource[]> {
    this.claimCount += 1;
    return [source(this.claimCount)];
  }
  public async completeSourceCapture(): Promise<boolean> {
    this.completed.push('completed');
    return true;
  }
  public async ingestCdcEvent() {
    return { duplicate: false, matchedSources: 0, windowIds: [] };
  }
  public async sealDueCdcWindows() {
    return { windows: [], notificationCount: 0, assignmentCount: 0 };
  }
  public async releaseSourceClaim(id: string): Promise<boolean> {
    this.released.push(id);
    return true;
  }
  public async establishBaseline(
    input: EstablishWatchSourceBaseline,
  ): Promise<DataWorkflowWatchSourceCheckpoint> {
    this.checkpoint = {
      id: input.id,
      organizationId: input.organizationId,
      watchSourceId: input.watchSourceId,
      relation: input.relation,
      opaqueCheckpoint: input.checkpoint,
      revision: 1,
      establishedAt: input.establishedAt,
      advancedAt: input.establishedAt,
    };
    return this.checkpoint;
  }
  public async recordCapture(input: CaptureWatchSourceNotification): Promise<{
    duplicate: boolean;
    assignments: readonly DataWorkflowWatchSourceDeliveryAssignment[];
  }> {
    this.notifications.push(input);
    this.checkpoint = {
      ...this.checkpoint!,
      opaqueCheckpoint: input.checkpoint.through,
      revision: input.checkpoint.expectedRevision + 1,
      advancedAt: input.checkpoint.advancedAt,
    };
    return { duplicate: false, assignments: [] };
  }
  public async claimDueAssignments() {
    return [];
  }
  public async releaseClaim() {
    return false;
  }
  public async attachAssignmentsToRun() {
    return true;
  }
  public async listDispatchedAssignments() {
    return [];
  }
  public async completeDeliveryForRun() {
    return false;
  }
  public async blockDeliveryForRun() {
    return false;
  }
  public async completeDelivery() {
    return false;
  }
}

function source(revision: number): DataWorkflowWatchSource {
  return {
    id: SOURCE_ID,
    organizationId: ORGANIZATION_ID,
    databaseServiceId: '66666666-6666-4666-8666-666666666666',
    adapterKey: 'POSTGRESQL_POLLING',
    adapterVersion: '1',
    trigger: {
      type: 'WATCH_SOURCE',
      mode: 'POLLING',
      databaseServiceId: '66666666-6666-4666-8666-666666666666',
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
    revision,
    nextCaptureAt: NOW,
    leaseOwner: 'worker',
    leaseToken: `77777777-7777-4777-8777-${String(revision).padStart(12, '0')}`,
    leaseExpiresAt: new Date(NOW.getTime() + 30_000),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function clock(): IClock {
  return { now: () => NOW };
}

function ids(): IIdGenerator {
  let count = 0;
  return { next: () => `88888888-8888-4888-8888-${String(++count).padStart(12, '0')}` };
}

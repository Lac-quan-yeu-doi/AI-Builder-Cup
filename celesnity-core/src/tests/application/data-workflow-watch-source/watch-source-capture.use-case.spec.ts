import { EstablishWatchSourceBaselineUseCase } from '@application/data-workflow-watch-source/establish-watch-source-baseline.use-case';
import { RecordWatchSourceCaptureUseCase } from '@application/data-workflow-watch-source/record-watch-source-capture.use-case';
import type {
  CaptureWatchSourceNotification,
  EstablishWatchSourceBaseline,
  IWatchSourceRepository,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type {
  CreateDataWorkflowWatchSource,
  CreateDataWorkflowWatchSourceSubscription,
  DataWorkflowWatchSourceDeliveryAssignment,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const WATCH_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-09-18T09:00:00.000Z');
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

describe('Watch Source capture use cases', () => {
  it('establishes an explicit baseline without creating a notification or assignment', async () => {
    const repository = new FakeWatchSourceRepository();
    const useCase = new EstablishWatchSourceBaselineUseCase(repository, fixedClock(), fixedIds());

    await useCase.execute({
      organizationId: ORGANIZATION_ID,
      watchSourceId: WATCH_SOURCE_ID,
      relation: { schema: 'public', table: 'orders' },
      checkpoint: 'opaque-baseline',
    });

    expect(repository.baselines).toEqual([
      expect.objectContaining({ checkpoint: 'opaque-baseline', establishedAt: NOW }),
    ]);
    expect(repository.captures).toEqual([]);
  });

  it('records a durable notification before advancing its checkpoint and deduplicates retries', async () => {
    const repository = new FakeWatchSourceRepository();
    const useCase = new RecordWatchSourceCaptureUseCase(repository, fixedClock(), fixedIds());
    const input = captureInput();

    const first = await useCase.execute(input);
    const retry = await useCase.execute(input);

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(repository.operations).toEqual(['notification', 'checkpoint', 'assignment']);
    expect(repository.captures).toHaveLength(1);
    expect(repository.captures[0]).toMatchObject({
      notification: expect.not.objectContaining({
        sourceRow: expect.anything(),
        primaryKey: expect.anything(),
      }),
    });
  });

  it('pins assignments to the published workflow version and leaves failed delivery pending', async () => {
    const repository = new FakeWatchSourceRepository();
    const capture = new RecordWatchSourceCaptureUseCase(repository, fixedClock(), fixedIds());
    const result = await capture.execute(captureInput());

    expect(result.assignments).toEqual([
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        workflowVersionId: VERSION_ID,
        status: 'PENDING',
      }),
    ]);
    await expect(repository.completeDelivery(result.assignments[0]!.id, false, NOW)).resolves.toBe(
      false,
    );
    expect(repository.assignments[0]).toMatchObject({ status: 'PENDING' });
    expect(repository.assignments[0]).not.toHaveProperty('deliveredAt');
  });

  it('does not let a capture in another organization use this source', async () => {
    const repository = new FakeWatchSourceRepository();
    const useCase = new RecordWatchSourceCaptureUseCase(repository, fixedClock(), fixedIds());

    await expect(
      useCase.execute({
        ...captureInput(),
        organizationId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toThrow('organization');
  });
});

class FakeWatchSourceRepository implements IWatchSourceRepository {
  public readonly baselines: EstablishWatchSourceBaseline[] = [];
  public readonly captures: CaptureWatchSourceNotification[] = [];
  public readonly operations: string[] = [];
  public readonly assignments: Mutable<DataWorkflowWatchSourceDeliveryAssignment>[] = [];

  public synchronizePublication(): Promise<void> {
    return Promise.resolve();
  }
  public health() {
    return Promise.resolve(undefined);
  }
  public retryBlocked() {
    return Promise.resolve(0);
  }

  public createSource(_input: CreateDataWorkflowWatchSource): never {
    throw new Error('Not needed by this use-case test.');
  }

  public createSubscription(_input: CreateDataWorkflowWatchSourceSubscription): never {
    throw new Error('Not needed by this use-case test.');
  }

  public findActiveSubscriptions(organizationId: string, watchSourceId: string) {
    this.assertOrganization(organizationId);
    if (watchSourceId !== WATCH_SOURCE_ID) throw new Error('watch source mismatch');
    return Promise.resolve([
      {
        id: SUBSCRIPTION_ID,
        organizationId,
        watchSourceId,
        workflowId: WORKFLOW_ID,
        workflowVersionId: VERSION_ID,
        actor: 'publisher',
        enabled: true,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  }

  public findSubscription() {
    return Promise.resolve(undefined);
  }

  public findNotification() {
    return Promise.resolve(undefined);
  }

  public listEnabledSources() {
    return Promise.resolve([]);
  }

  public findCheckpoint() {
    return Promise.resolve(undefined);
  }

  public claimDueSources() {
    return Promise.resolve([]);
  }

  public completeSourceCapture() {
    return Promise.resolve(true);
  }

  public ingestCdcEvent() {
    return Promise.resolve({ duplicate: false, matchedSources: 0, windowIds: [] });
  }

  public sealDueCdcWindows() {
    return Promise.resolve({ windows: [], notificationCount: 0, assignmentCount: 0 });
  }

  public releaseSourceClaim() {
    return Promise.resolve(false);
  }

  public establishBaseline(input: EstablishWatchSourceBaseline) {
    this.assertOrganization(input.organizationId);
    this.baselines.push(input);
    return Promise.resolve({
      id: input.id,
      organizationId: input.organizationId,
      watchSourceId: input.watchSourceId,
      relation: input.relation,
      opaqueCheckpoint: input.checkpoint,
      revision: 1,
      establishedAt: input.establishedAt,
      advancedAt: input.establishedAt,
    });
  }

  public recordCapture(input: CaptureWatchSourceNotification) {
    this.assertOrganization(input.organizationId);
    if (
      this.captures.some(
        (capture) => capture.notification.idempotencyKey === input.notification.idempotencyKey,
      )
    ) {
      return Promise.resolve({ duplicate: true, assignments: this.assignments });
    }
    this.operations.push('notification', 'checkpoint', 'assignment');
    this.captures.push(input);
    const assignment: Mutable<DataWorkflowWatchSourceDeliveryAssignment> = {
      id: input.assignments[0]!.id,
      organizationId: input.organizationId,
      subscriptionId: SUBSCRIPTION_ID,
      notificationId: input.notification.id,
      workflowId: WORKFLOW_ID,
      workflowVersionId: VERSION_ID,
      status: 'PENDING',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.assignments.push(assignment);
    return Promise.resolve({ duplicate: false, assignments: [assignment] });
  }

  public completeDelivery(id: string, succeeded: boolean, deliveredAt: Date) {
    const assignment = this.assignments.find((candidate) => candidate.id === id);
    if (assignment === undefined || !succeeded) return Promise.resolve(false);
    assignment.status = 'DELIVERED';
    assignment.deliveredAt = deliveredAt;
    return Promise.resolve(true);
  }

  public claimDueAssignments() {
    return Promise.resolve([]);
  }

  public releaseClaim() {
    return Promise.resolve(false);
  }

  public attachAssignmentsToRun() {
    return Promise.resolve(true);
  }

  public listDispatchedAssignments() {
    return Promise.resolve([]);
  }

  public completeDeliveryForRun() {
    return Promise.resolve(false);
  }

  public blockDeliveryForRun() {
    return Promise.resolve(false);
  }

  private assertOrganization(organizationId: string): void {
    if (organizationId !== ORGANIZATION_ID) throw new Error('organization mismatch');
  }
}

function captureInput(): Parameters<RecordWatchSourceCaptureUseCase['execute']>[0] {
  return {
    organizationId: ORGANIZATION_ID,
    watchSourceId: WATCH_SOURCE_ID,
    relation: { schema: 'public', table: 'orders' },
    fromCheckpoint: 'opaque-baseline',
    throughCheckpoint: 'opaque-next',
    expectedCheckpointRevision: 1,
    fingerprint: 'sha256:metadata-only',
    changeTypes: ['INSERT', 'UPDATE'],
  };
}

function fixedClock(): IClock {
  return { now: () => NOW };
}

function fixedIds(): IIdGenerator {
  let counter = 0;
  return { next: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` };
}

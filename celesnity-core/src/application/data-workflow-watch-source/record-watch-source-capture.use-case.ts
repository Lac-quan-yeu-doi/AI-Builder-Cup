import type {
  IWatchSourceRepository,
  RecordWatchSourceCaptureResult,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type {
  WatchSourceChangeType,
  WatchSourceRelation,
} from '@domain/data-workflow-watch-source/models/watch-source';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface RecordWatchSourceCaptureInput {
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly relation: WatchSourceRelation;
  readonly fromCheckpoint: string;
  readonly throughCheckpoint: string;
  readonly expectedCheckpointRevision: number;
  readonly fingerprint: string;
  readonly changeTypes: readonly WatchSourceChangeType[];
  readonly adapterKey?: string;
  readonly adapterVersion?: string;
}

/** Converts a P3 observation into durable metadata-only work. It never dispatches a workflow. */
export class RecordWatchSourceCaptureUseCase {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async execute(
    input: RecordWatchSourceCaptureInput,
  ): Promise<RecordWatchSourceCaptureResult> {
    const now = this.clock.now();
    const subscriptions = await this.repository.findActiveSubscriptions(
      input.organizationId,
      input.watchSourceId,
    );
    const notificationId = this.ids.next();
    return this.repository.recordCapture({
      organizationId: input.organizationId,
      watchSourceId: input.watchSourceId,
      batch: { id: this.ids.next(), captureKey: captureKey(input), capturedAt: now },
      notification: {
        id: notificationId,
        relation: input.relation,
        changeTypes: input.changeTypes,
        checkpointFingerprint: input.fingerprint,
        idempotencyKey: notificationKey(input),
        adapterKey: input.adapterKey ?? 'polling',
        adapterVersion: input.adapterVersion ?? 'v1',
        capturedAt: now,
      },
      checkpoint: {
        from: input.fromCheckpoint,
        through: input.throughCheckpoint,
        expectedRevision: input.expectedCheckpointRevision,
        advancedAt: now,
      },
      assignments: subscriptions.map((subscription) => ({
        id: this.ids.next(),
        subscriptionId: subscription.id,
        workflowId: subscription.workflowId,
        workflowVersionId: subscription.workflowVersionId,
        now,
      })),
    });
  }
}

function captureKey(input: RecordWatchSourceCaptureInput): string {
  return digest([
    input.watchSourceId,
    input.relation.schema,
    input.relation.table,
    input.fromCheckpoint,
    input.throughCheckpoint,
  ]);
}

function notificationKey(input: RecordWatchSourceCaptureInput): string {
  return digest([input.watchSourceId, captureKey(input), input.fingerprint]);
}

/** Persist only a stable digest; checkpoint values never leak into a notification key. */
function digest(parts: readonly string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}
import { createHash } from 'node:crypto';

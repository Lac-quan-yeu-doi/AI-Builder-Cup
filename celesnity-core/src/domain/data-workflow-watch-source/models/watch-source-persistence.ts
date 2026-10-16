import type {
  WatchSourceChangeType,
  WatchSourceCursor,
  WatchSourceRelation,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';

/** Durable, credential-free description of a source that may be watched. */
export interface DataWorkflowWatchSource {
  readonly id: string;
  readonly organizationId: string;
  readonly databaseServiceId: string;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly trigger: WorkflowWatchSourceTrigger;
  readonly enabled: boolean;
  readonly revision: number;
  /** The next fixed cadence boundary eligible for a polling capture. */
  readonly nextCaptureAt: Date;
  readonly lastCaptureAt?: Date;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A subscription always references the immutable version that was published. */
export interface DataWorkflowWatchSourceSubscription {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly actor: string;
  readonly enabled: boolean;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A cursor value is intentionally opaque to the application and notification surfaces. */
export interface DataWorkflowWatchSourceCheckpoint {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly relation: WatchSourceRelation;
  readonly opaqueCheckpoint: string;
  readonly revision: number;
  readonly establishedAt: Date;
  readonly advancedAt: Date;
}

/** One observed capture cycle, potentially containing a notification for each changed relation. */
export interface DataWorkflowWatchSourceNotificationBatch {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly captureKey: string;
  readonly capturedAt: Date;
}

/**
 * Metadata-only change signal. It never contains customer row values, cursor
 * values, primary keys, SQL text, or connection details.
 */
export interface DataWorkflowWatchSourceNotification {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly batchId: string;
  readonly relation: WatchSourceRelation;
  readonly changeTypes: readonly WatchSourceChangeType[];
  readonly checkpointFingerprint: string;
  readonly idempotencyKey: string;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly capturedAt: Date;
}

export type WatchSourceDeliveryStatus =
  'PENDING' | 'CLAIMED' | 'DISPATCHED' | 'DELIVERED' | 'BLOCKED';

/** A durable, deduplicated hand-off to one immutable workflow version. */
export interface DataWorkflowWatchSourceDeliveryAssignment {
  readonly id: string;
  readonly organizationId: string;
  readonly subscriptionId: string;
  readonly notificationId: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly workflowRunId?: string;
  readonly status: WatchSourceDeliveryStatus;
  readonly revision: number;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: Date;
  readonly deliveredAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDataWorkflowWatchSource {
  readonly id: string;
  readonly organizationId: string;
  readonly databaseServiceId: string;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly trigger: WorkflowWatchSourceTrigger;
  readonly enabled: boolean;
  readonly now: Date;
  readonly nextCaptureAt?: Date;
}

export interface CreateDataWorkflowWatchSourceSubscription {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly actor: string;
  readonly now: Date;
}

/** Kept here to make the durable schema's cursor restriction explicit. */
export type DataWorkflowWatchSourceCursor = WatchSourceCursor;

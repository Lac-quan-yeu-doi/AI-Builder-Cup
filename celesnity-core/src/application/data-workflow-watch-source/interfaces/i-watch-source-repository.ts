import type {
  WatchSourceChangeType,
  WatchSourceRelation,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';
import type {
  CreateDataWorkflowWatchSource,
  CreateDataWorkflowWatchSourceSubscription,
  DataWorkflowWatchSource,
  DataWorkflowWatchSourceCheckpoint,
  DataWorkflowWatchSourceDeliveryAssignment,
  DataWorkflowWatchSourceNotification,
  DataWorkflowWatchSourceSubscription,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import type {
  CdcMetadataEvent,
  CdcWindow,
} from '@domain/data-workflow-watch-source/models/cdc-event';

export interface EstablishWatchSourceBaseline {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly relation: WatchSourceRelation;
  readonly checkpoint: string;
  readonly establishedAt: Date;
}

export interface CaptureWatchSourceNotification {
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly batch: { readonly id: string; readonly captureKey: string; readonly capturedAt: Date };
  readonly notification: {
    readonly id: string;
    readonly relation: WatchSourceRelation;
    readonly changeTypes: readonly WatchSourceChangeType[];
    readonly checkpointFingerprint: string;
    readonly idempotencyKey: string;
    readonly adapterKey: string;
    readonly adapterVersion: string;
    readonly capturedAt: Date;
  };
  readonly checkpoint: {
    readonly from: string;
    readonly through: string;
    readonly expectedRevision: number;
    readonly advancedAt: Date;
  };
  readonly assignments: readonly {
    readonly id: string;
    readonly subscriptionId: string;
    readonly workflowId: string;
    readonly workflowVersionId: string;
    readonly now: Date;
  }[];
}

export interface RecordWatchSourceCaptureResult {
  readonly duplicate: boolean;
  readonly assignments: readonly DataWorkflowWatchSourceDeliveryAssignment[];
}

export interface ClaimWatchSourceSources {
  readonly limit: number;
  readonly owner: string;
  readonly now: Date;
  readonly leaseMs: number;
}

export interface CompleteWatchSourceCapture {
  readonly id: string;
  readonly owner: string;
  readonly token: string;
  readonly completedAt: Date;
  readonly nextCaptureAt: Date;
}

export interface IngestCdcEventResult {
  readonly duplicate: boolean;
  readonly matchedSources: number;
  readonly windowIds: readonly string[];
}

export interface SealCdcWindowsResult {
  readonly windows: readonly CdcWindow[];
  readonly notificationCount: number;
  readonly assignmentCount: number;
}

export interface AttachWatchSourceAssignmentsToRun {
  readonly workflowRunId: string;
  readonly owner: string;
  readonly assignments: readonly { readonly id: string; readonly token: string }[];
  readonly now: Date;
}

export interface SynchronizeWatchSourcePublication {
  readonly organizationId: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly actor: string;
  readonly sourceId: string;
  readonly subscriptionId: string;
  readonly databaseServiceId: string;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly trigger: WorkflowWatchSourceTrigger;
  readonly now: Date;
}

export interface WatchSourceDeliverySummary {
  readonly pending: number;
  readonly claimed: number;
  readonly dispatched: number;
  readonly delivered: number;
  readonly blocked: number;
}

export interface WatchSourceHealthView {
  readonly source: DataWorkflowWatchSource;
  readonly checkpoints: readonly DataWorkflowWatchSourceCheckpoint[];
  readonly delivery: WatchSourceDeliverySummary;
  readonly lastCapturedAt?: Date;
}

export interface ClaimWatchSourceDeliveryAssignments {
  readonly limit: number;
  readonly owner: string;
  readonly now: Date;
  readonly leaseMs: number;
}

export interface IWatchSourceRepository {
  synchronizePublication(input: SynchronizeWatchSourcePublication): Promise<void>;
  /** Returns active CDC database services so external connector state can be reconciled after publication. */
  listActiveCdcDatabaseServiceIds?(organizationId: string): Promise<readonly string[]>;
  /** Returns the active CDC table selections for connector include-list unioning. */
  listActiveCdcRelations?(
    organizationId: string,
    databaseServiceId: string,
  ): Promise<readonly WatchSourceRelation[]>;
  health(organizationId: string, watchSourceId: string): Promise<WatchSourceHealthView | undefined>;
  retryBlocked(organizationId: string, watchSourceId: string, now: Date): Promise<number>;
  createSource(input: CreateDataWorkflowWatchSource): Promise<DataWorkflowWatchSource>;
  createSubscription(
    input: CreateDataWorkflowWatchSourceSubscription,
  ): Promise<DataWorkflowWatchSourceSubscription>;
  findActiveSubscriptions(
    organizationId: string,
    watchSourceId: string,
  ): Promise<readonly DataWorkflowWatchSourceSubscription[]>;
  findSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<DataWorkflowWatchSourceSubscription | undefined>;
  findNotification(
    organizationId: string,
    notificationId: string,
  ): Promise<DataWorkflowWatchSourceNotification | undefined>;
  listEnabledSources(): Promise<readonly DataWorkflowWatchSource[]>;
  findCheckpoint(
    organizationId: string,
    watchSourceId: string,
    relation: WatchSourceRelation,
  ): Promise<DataWorkflowWatchSourceCheckpoint | undefined>;
  claimDueSources(input: ClaimWatchSourceSources): Promise<readonly DataWorkflowWatchSource[]>;
  /** Advances a fixed polling cadence only after every selected relation completed successfully. */
  completeSourceCapture(input: CompleteWatchSourceCapture): Promise<boolean>;
  ingestCdcEvent(event: CdcMetadataEvent, now: Date): Promise<IngestCdcEventResult>;
  sealDueCdcWindows(now: Date, limit: number): Promise<SealCdcWindowsResult>;
  releaseSourceClaim(id: string, owner: string, token: string): Promise<boolean>;
  establishBaseline(
    input: EstablishWatchSourceBaseline,
  ): Promise<DataWorkflowWatchSourceCheckpoint>;
  /** The adapter must write notification durability before moving the cursor. */
  recordCapture(input: CaptureWatchSourceNotification): Promise<RecordWatchSourceCaptureResult>;
  /** P4 consumes these under a lease fence; P2 exposes the durable claim boundary only. */
  claimDueAssignments(
    input: ClaimWatchSourceDeliveryAssignments,
  ): Promise<readonly DataWorkflowWatchSourceDeliveryAssignment[]>;
  releaseClaim(id: string, owner: string, token: string): Promise<boolean>;
  attachAssignmentsToRun(input: AttachWatchSourceAssignmentsToRun): Promise<boolean>;
  listDispatchedAssignments(
    limit: number,
  ): Promise<readonly DataWorkflowWatchSourceDeliveryAssignment[]>;
  completeDeliveryForRun(id: string, workflowRunId: string, deliveredAt: Date): Promise<boolean>;
  blockDeliveryForRun(id: string, workflowRunId: string, blockedAt: Date): Promise<boolean>;
  /** False leaves the assignment pending. Successful delivery requires a lease fence. */
  completeDelivery(
    id: string,
    succeeded: boolean,
    deliveredAt: Date,
    lease?: { readonly owner: string; readonly token: string },
  ): Promise<boolean>;
}

import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';
import type { DataWorkflowWatchSource } from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import type {
  WatchSourceChangeType,
  WatchSourceCursor,
  WatchSourceRelation,
} from '@domain/data-workflow-watch-source/models/watch-source';

export interface WatchSourcePollingInput {
  readonly profile: DatabaseServiceRuntimeProfile;
  readonly source: DataWorkflowWatchSource;
  readonly relation: WatchSourceRelation;
  readonly cursor: WatchSourceCursor;
  readonly checkpoint: string;
  readonly limit: number;
  readonly deadline: Date;
  readonly signal: AbortSignal;
}

export interface WatchSourcePollingObservation {
  readonly fromCheckpoint: string;
  readonly throughCheckpoint: string;
  readonly fingerprint: string;
  readonly changeTypes: readonly WatchSourceChangeType[];
}

/** Runtime source adapter. It may inspect cursor values transiently, but never returns row data. */
export interface IWatchSourcePollingAdapter {
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly connectorType: string;
  establishBaseline(input: WatchSourcePollingInput): Promise<string>;
  poll(input: WatchSourcePollingInput): Promise<WatchSourcePollingObservation | undefined>;
}

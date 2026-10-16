/** Metadata-only source watching contract. No source rows, credentials, or change payloads belong here. */
import type {
  WatchSourceChangeType,
  WatchSourceRelation,
} from '@domain/data-workflow/models/workflow-trigger';
import type { CdcPreflightResult } from '@domain/data-workflow-watch-source/models/cdc-connector';

export type {
  WatchSourceChangeType,
  WatchSourceCursor,
  WatchSourceRelation,
  WorkflowCdcRelation,
  WorkflowPollingRelation,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow/models/workflow-trigger';

export interface WatchSourceCapabilities {
  readonly connectorType: string;
  readonly polling: boolean;
  readonly cdc: boolean;
  readonly supportedChangeTypes: readonly WatchSourceChangeType[];
  readonly reason?: 'UNSUPPORTED_CONNECTOR' | 'UNVERIFIED_SOURCE';
}

export type WatchSourceValidationIssueCode =
  | 'UNSUPPORTED_CONNECTOR'
  | 'NO_RELIABLE_CURSOR'
  | 'UNSUPPORTED_CHANGE_TYPE'
  | 'RELATION_NOT_AVAILABLE'
  | 'CURSOR_COLUMN_NOT_AVAILABLE';

export interface WatchSourceValidationIssue {
  readonly code: WatchSourceValidationIssueCode;
  readonly changeType?: WatchSourceChangeType;
  readonly relation?: WatchSourceRelation;
  readonly column?: string;
}

export interface WatchSourceValidationResult {
  readonly capabilities: WatchSourceCapabilities;
  readonly issues: readonly WatchSourceValidationIssue[];
  readonly cdcPreflight?: CdcPreflightResult;
}

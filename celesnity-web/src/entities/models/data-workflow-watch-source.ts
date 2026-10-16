export type DataWorkflowWatchSourceChangeType = 'INSERT' | 'UPDATE' | 'DELETE';
export type DataWorkflowWatchSourceWeekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface DataWorkflowWatchSourceRelation {
  readonly schema: string;
  readonly table: string;
}

export interface DataWorkflowWatchSourceCatalogColumn {
  readonly name: string;
  readonly nativeType: string;
  readonly nullable: boolean;
}

export interface DataWorkflowWatchSourceCatalogRelation extends DataWorkflowWatchSourceRelation {
  readonly relationType: string;
  readonly columns: readonly DataWorkflowWatchSourceCatalogColumn[];
}

export interface DataWorkflowWatchSourceCatalogService {
  readonly id: string;
  readonly name: string;
  readonly databaseNames: readonly string[];
  /** @deprecated Use databaseNames. */
  readonly databaseName?: string;
  readonly connectorType: string;
  readonly verificationStatus: 'SUCCEEDED';
  readonly metadataAvailable: boolean;
}

export interface DataWorkflowWatchSourceCatalogQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

export interface DataWorkflowWatchSourceCatalogPage<T> {
  readonly data: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export interface DataWorkflowWatchSourceCursor {
  readonly changeColumn: string;
  readonly tieBreakerColumn: string;
}

export interface DataWorkflowWatchSourcePollingRelation extends DataWorkflowWatchSourceRelation {
  readonly cursor: DataWorkflowWatchSourceCursor;
}

export type DataWorkflowWatchSourceCdcRelation = DataWorkflowWatchSourceRelation;

export interface DataWorkflowWatchSourcePollingTrigger {
  readonly type: 'WATCH_SOURCE';
  readonly mode: 'POLLING';
  readonly databaseServiceId: string;
  readonly everySeconds: number;
  readonly relations: readonly DataWorkflowWatchSourcePollingRelation[];
}

export interface DataWorkflowWatchSourceCdcTrigger {
  readonly type: 'WATCH_SOURCE';
  readonly mode: 'CDC';
  readonly databaseServiceId: string;
  readonly aggregationWindowSeconds: number;
  readonly relations: readonly DataWorkflowWatchSourceCdcRelation[];
  readonly changeTypes: readonly DataWorkflowWatchSourceChangeType[];
}

export type DataWorkflowWatchSourceTrigger =
  DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger;

export interface DataWorkflowWatchSourceCapabilities {
  readonly connectorType: string;
  readonly polling: boolean;
  readonly cdc: boolean;
  readonly supportedChangeTypes: readonly DataWorkflowWatchSourceChangeType[];
  readonly reason?: 'UNSUPPORTED_CONNECTOR' | 'UNVERIFIED_SOURCE';
}

export type DataWorkflowWatchSourceValidationIssueCode =
  | 'UNSUPPORTED_CONNECTOR'
  | 'NO_RELIABLE_CURSOR'
  | 'UNSUPPORTED_CHANGE_TYPE'
  | 'RELATION_NOT_AVAILABLE'
  | 'CURSOR_COLUMN_NOT_AVAILABLE';

export interface DataWorkflowWatchSourceValidationIssue {
  readonly code: DataWorkflowWatchSourceValidationIssueCode;
  readonly changeType?: DataWorkflowWatchSourceChangeType;
  readonly relation?: DataWorkflowWatchSourceRelation;
  readonly column?: string;
}

export type DataWorkflowWatchSourceCdcPreflightCode =
  | 'READY'
  | 'UNSUPPORTED_CONNECTOR'
  | 'SOURCE_UNREACHABLE'
  | 'WAL_LEVEL_NOT_LOGICAL'
  | 'REPLICATION_PRIVILEGE_MISSING'
  | 'BINLOG_DISABLED'
  | 'BINLOG_FORMAT_NOT_ROW'
  | 'CONNECTOR_UNAVAILABLE'
  | 'SOURCE_CONFIGURATION_INVALID'
  | 'CONNECTOR_CONFIGURATION_INVALID'
  | 'CONNECTOR_TASK_FAILED'
  | 'CDC_CONNECTION_REQUIRED'
  | 'CDC_CONNECTION_NOT_READY'
  | 'CDC_PUBLICATION_REQUIRED'
  | 'CDC_SLOT_REQUIRED'
  | 'AUTHENTICATION_FAILED';

export interface DataWorkflowWatchSourceCdcPreflight {
  readonly available: boolean;
  readonly code: DataWorkflowWatchSourceCdcPreflightCode;
  readonly message: string;
  readonly remediation?: string;
}

export interface DataWorkflowWatchSourceValidationResult {
  readonly capabilities: DataWorkflowWatchSourceCapabilities;
  readonly issues: readonly DataWorkflowWatchSourceValidationIssue[];
  readonly cdcPreflight?: DataWorkflowWatchSourceCdcPreflight;
}

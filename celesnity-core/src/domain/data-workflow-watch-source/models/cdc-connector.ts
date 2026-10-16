export type CdcConnectorLifecycle = 'RUNNING' | 'PAUSED' | 'SETUP_REQUIRED' | 'FAILED';

export type CdcPreflightCode =
  | 'READY'
  | 'UNSUPPORTED_CONNECTOR'
  | 'DIRECT_CONNECTION_REQUIRED'
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

export interface CdcPreflightResult {
  readonly available: boolean;
  readonly code: CdcPreflightCode;
  readonly message: string;
  readonly remediation?: string;
}

export interface CdcConnectorStatus {
  readonly name: string;
  readonly lifecycle: CdcConnectorLifecycle;
  readonly preflight: CdcPreflightResult;
}

export type FtpsConnectionStatus = 'Success' | 'Fail';

export type FtpsStatusFailureReason =
  | 'NO_ACTIVE_CONNECTION'
  | 'STATUS_SERVICE_UNAVAILABLE'
  | 'STATUS_AUTHENTICATION_FAILED'
  | 'STATUS_RESPONSE_INVALID';

export interface FtpsActiveConnectionView {
  readonly connectionId: string;
  readonly remoteAddress?: string;
  readonly connectedAt?: string;
  readonly lastActivityAt?: string;
}

export interface FtpsStatusProbeResult {
  readonly status: FtpsConnectionStatus;
  readonly username: string;
  readonly activeConnectionCount: number;
  readonly connection?: FtpsActiveConnectionView;
  readonly reason?: FtpsStatusFailureReason;
}

export interface FtpsConnectorMetadataView {
  readonly connectorType: 'FTPS';
  readonly host: string;
  readonly port: number;
  readonly encryption: 'explicit-tls';
  readonly transferMode: 'passive';
  readonly remotePath: string;
  readonly username: string;
  /** External FTPS client credential returned for the first-version form. */
  readonly password: string;
}

export interface FtpsStatusView extends FtpsStatusProbeResult {
  readonly checkedAt: string;
}

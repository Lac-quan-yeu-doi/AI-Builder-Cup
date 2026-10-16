import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';

export type CdcConnectionRuntimeErrorCode = 'CDC_CONNECTION_REQUIRED' | 'CDC_CONNECTION_NOT_READY';

export class CdcConnectionRuntimeError extends Error {
  public constructor(public readonly code: CdcConnectionRuntimeErrorCode) {
    super(code);
    this.name = 'CdcConnectionRuntimeError';
  }
}

export interface ICdcConnectionRuntimeProvider {
  requireVerified(databaseServiceId: string): Promise<CdcConnectionRuntimeProfile>;
}

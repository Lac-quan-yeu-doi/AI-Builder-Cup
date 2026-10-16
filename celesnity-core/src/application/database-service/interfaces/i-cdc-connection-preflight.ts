import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { NetworkDestination } from '@application/database-service/interfaces/i-connection-probe';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import type {
  CdcConnectionIssueCode,
  CdcConnectionSetupMode,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';

export interface CdcConnectionPreflightInput {
  readonly databaseServiceId: string;
  readonly connectorType: string;
  readonly config: NormalizedConnectionConfig;
  readonly destination: NetworkDestination;
  readonly credential: PlaintextCredentialPayload;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
}

export type CdcConnectionPreflightResult =
  | { readonly status: CdcConnectionVerificationStatus.READY }
  | {
      readonly status:
        CdcConnectionVerificationStatus.SETUP_REQUIRED | CdcConnectionVerificationStatus.FAILED;
      readonly issueCode: CdcConnectionIssueCode;
      readonly message: string;
    };

export interface ICdcConnectionPreflight {
  /** Reads source metadata only. Implementations must not create or alter source objects. */
  validate(input: CdcConnectionPreflightInput): Promise<CdcConnectionPreflightResult>;
}

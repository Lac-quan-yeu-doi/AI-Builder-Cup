import type { JsonObject } from '@domain/database-service/value-objects/normalized-connection-config';
import type { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import type {
  CdcConnectionIssueCode,
  CdcConnectionSetupMode,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';

export interface CdcConnectionProfileView {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly connectorType: string;
  readonly endpointSummary: string;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
  readonly verificationStatus: CdcConnectionVerificationStatus;
  readonly verificationIssueCode?: CdcConnectionIssueCode;
  readonly verificationMessage?: string;
  readonly lastTestedAt?: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function cdcEndpointSummary(config: JsonObject): string {
  const host = typeof config.host === 'string' ? config.host : 'unknown-host';
  const port = typeof config.port === 'number' ? config.port : 0;
  const databaseName =
    typeof config.databaseName === 'string' ? config.databaseName : 'unknown-database';
  return `${host}:${port}/${databaseName}`;
}

export function toCdcConnectionProfileView(
  profile: CdcConnectionProfile,
): CdcConnectionProfileView {
  return {
    id: profile.id.value,
    databaseServiceId: profile.databaseServiceId.value,
    connectorType: profile.connectorType.value,
    endpointSummary: cdcEndpointSummary(profile.config.toRecord()),
    setupMode: profile.setupMode,
    publicationName: profile.publicationName,
    slotName: profile.slotName,
    verificationStatus: profile.verification.status,
    verificationIssueCode: profile.verification.issueCode,
    verificationMessage: profile.verification.message,
    lastTestedAt: profile.verification.lastTestedAt?.toISOString(),
    revision: profile.revision,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

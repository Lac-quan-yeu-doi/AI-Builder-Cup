import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';
import type {
  DatabaseServiceCdcConnectionProfileGetPayload,
  DatabaseServiceCdcConnectionProfileModel,
  DatabaseServiceCdcConnectionProfileSelect,
} from '@generated/prisma/models/DatabaseServiceCdcConnectionProfile';
import type {
  CdcConnectionSetupMode as PrismaCdcConnectionSetupMode,
  CdcConnectionVerificationStatus as PrismaCdcConnectionVerificationStatus,
} from '@generated/prisma/enums';
import {
  cdcEndpointSummary,
  type CdcConnectionProfileView,
} from '@application/database-service/read-models/cdc-connection-profile';
import { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import {
  CdcConnectionProfileId,
  CdcConnectionSetupMode,
  CdcConnectionVerification,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  CredentialReference,
} from '@domain/database-service/value-objects/connection-value-objects';
import { checkedJsonObject } from '@infrastructure/prisma/database-service/database-service.mapper';

export const NON_SECRET_CDC_CONNECTION_PROFILE_SELECTION = {
  id: true,
  databaseServiceId: true,
  connectorType: true,
  config: true,
  configSchemaVersion: true,
  setupMode: true,
  publicationName: true,
  slotName: true,
  verificationStatus: true,
  verificationIssueCode: true,
  verificationMessage: true,
  lastTestedAt: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies DatabaseServiceCdcConnectionProfileSelect;

export type NonSecretCdcConnectionProfileRecord = DatabaseServiceCdcConnectionProfileGetPayload<{
  select: typeof NON_SECRET_CDC_CONNECTION_PROFILE_SELECTION;
}>;

const TO_PRISMA_SETUP: Readonly<Record<CdcConnectionSetupMode, PrismaCdcConnectionSetupMode>> = {
  [CdcConnectionSetupMode.EXISTING]: 'EXISTING',
  [CdcConnectionSetupMode.MANAGED]: 'MANAGED',
};

const TO_DOMAIN_SETUP: Readonly<Record<PrismaCdcConnectionSetupMode, CdcConnectionSetupMode>> = {
  EXISTING: CdcConnectionSetupMode.EXISTING,
  MANAGED: CdcConnectionSetupMode.MANAGED,
};

const TO_PRISMA_STATUS: Readonly<
  Record<CdcConnectionVerificationStatus, PrismaCdcConnectionVerificationStatus>
> = {
  [CdcConnectionVerificationStatus.UNTESTED]: 'UNTESTED',
  [CdcConnectionVerificationStatus.READY]: 'READY',
  [CdcConnectionVerificationStatus.SETUP_REQUIRED]: 'SETUP_REQUIRED',
  [CdcConnectionVerificationStatus.FAILED]: 'FAILED',
};

const TO_DOMAIN_STATUS: Readonly<
  Record<PrismaCdcConnectionVerificationStatus, CdcConnectionVerificationStatus>
> = {
  UNTESTED: CdcConnectionVerificationStatus.UNTESTED,
  READY: CdcConnectionVerificationStatus.READY,
  SETUP_REQUIRED: CdcConnectionVerificationStatus.SETUP_REQUIRED,
  FAILED: CdcConnectionVerificationStatus.FAILED,
};

@Injectable()
export class CdcConnectionProfileMapper {
  public toDomain(record: DatabaseServiceCdcConnectionProfileModel): CdcConnectionProfile {
    return CdcConnectionProfile.rehydrate({
      id: CdcConnectionProfileId.from(record.id),
      organizationId: record.organizationId,
      databaseServiceId: ConnectionId.from(record.databaseServiceId),
      connectorType: ConnectorType.create(record.connectorType),
      config: NormalizedConnectionConfig.create(
        record.configSchemaVersion,
        checkedJsonObject(record.config),
      ),
      credential: CredentialReference.create({
        ciphertext: record.encryptedCredentialPayload,
        initializationVector: record.encryptionIv,
        authenticationTag: record.encryptionAuthTag,
        keyVersion: record.encryptionKeyVersion,
      }),
      credentialSchemaVersion: record.credentialSchemaVersion,
      setupMode: TO_DOMAIN_SETUP[record.setupMode],
      publicationName: record.publicationName ?? undefined,
      slotName: record.slotName ?? undefined,
      verification: CdcConnectionVerification.rehydrate(
        TO_DOMAIN_STATUS[record.verificationStatus],
        record.lastTestedAt ?? undefined,
        record.verificationIssueCode ?? undefined,
        record.verificationMessage ?? undefined,
      ),
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public toInsertPersistence(
    profile: CdcConnectionProfile,
  ): Prisma.DatabaseServiceCdcConnectionProfileUncheckedCreateInput {
    return {
      id: profile.id.value,
      organizationId: profile.organizationId,
      databaseServiceId: profile.databaseServiceId.value,
      createdAt: profile.createdAt,
      ...this.persistenceFields(profile),
    };
  }

  public toPersistence(
    profile: CdcConnectionProfile,
  ): Prisma.DatabaseServiceCdcConnectionProfileUncheckedUpdateInput {
    return this.persistenceFields(profile);
  }

  private persistenceFields(
    profile: CdcConnectionProfile,
  ): Omit<
    Prisma.DatabaseServiceCdcConnectionProfileUncheckedCreateInput,
    'id' | 'organizationId' | 'databaseServiceId' | 'createdAt'
  > {
    return {
      connectorType: profile.connectorType.value,
      config: profile.config.toRecord(),
      configSchemaVersion: profile.config.schemaVersion,
      encryptedCredentialPayload: profile.credential.ciphertext,
      credentialSchemaVersion: profile.credentialSchemaVersion,
      encryptionIv: profile.credential.initializationVector,
      encryptionAuthTag: profile.credential.authenticationTag,
      encryptionKeyVersion: profile.credential.keyVersion,
      setupMode: TO_PRISMA_SETUP[profile.setupMode],
      publicationName: profile.publicationName ?? null,
      slotName: profile.slotName ?? null,
      verificationStatus: TO_PRISMA_STATUS[profile.verification.status],
      verificationIssueCode: profile.verification.issueCode ?? null,
      verificationMessage: profile.verification.message ?? null,
      lastTestedAt: profile.verification.lastTestedAt ?? null,
      revision: profile.revision,
      updatedAt: profile.updatedAt,
    } satisfies Prisma.DatabaseServiceCdcConnectionProfileUncheckedUpdateInput;
  }

  public toView(record: NonSecretCdcConnectionProfileRecord): CdcConnectionProfileView {
    const config = NormalizedConnectionConfig.create(
      record.configSchemaVersion,
      checkedJsonObject(record.config),
    );
    return {
      id: record.id,
      databaseServiceId: record.databaseServiceId,
      connectorType: record.connectorType,
      endpointSummary: cdcEndpointSummary(config.toRecord()),
      setupMode: TO_DOMAIN_SETUP[record.setupMode],
      publicationName: record.publicationName ?? undefined,
      slotName: record.slotName ?? undefined,
      verificationStatus: TO_DOMAIN_STATUS[record.verificationStatus],
      verificationIssueCode:
        record.verificationIssueCode === null
          ? undefined
          : CdcConnectionVerification.rehydrate(
              TO_DOMAIN_STATUS[record.verificationStatus],
              record.lastTestedAt ?? undefined,
              record.verificationIssueCode,
              record.verificationMessage ?? undefined,
            ).issueCode,
      verificationMessage: record.verificationMessage ?? undefined,
      lastTestedAt: record.lastTestedAt?.toISOString(),
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

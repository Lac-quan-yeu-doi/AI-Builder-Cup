import type { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import type {
  ConnectionId,
  CredentialReference,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import {
  type CdcConnectionProfileId,
  CdcConnectionSetupMode,
  CdcConnectionVerification,
  type CdcConnectionVerificationStatus,
  normalizePostgresCdcIdentifier,
  type CdcConnectionIssueCode,
} from '@domain/database-service/value-objects/cdc-connection-profile';

export interface CdcConnectionProfileState {
  readonly id: CdcConnectionProfileId;
  readonly organizationId: string;
  readonly databaseServiceId: ConnectionId;
  readonly connectorType: ConnectorType;
  readonly config: NormalizedConnectionConfig;
  readonly credential: CredentialReference;
  readonly credentialSchemaVersion: number;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
  readonly verification: CdcConnectionVerification;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ChangeCdcConnectionProfile {
  readonly config: NormalizedConnectionConfig;
  readonly credential: CredentialReference;
  readonly credentialSchemaVersion: number;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
  readonly changedAt: Date;
}

export class CdcConnectionProfile {
  private readonly idValue: CdcConnectionProfileId;
  private readonly organizationIdValue: string;
  private readonly databaseServiceIdValue: ConnectionId;
  private readonly connectorTypeValue: ConnectorType;
  private readonly createdAtValue: Date;
  private configValue: NormalizedConnectionConfig;
  private credentialValue: CredentialReference;
  private credentialSchemaVersionValue: number;
  private setupModeValue: CdcConnectionSetupMode;
  private publicationNameValue: string | undefined;
  private slotNameValue: string | undefined;
  private verificationValue: CdcConnectionVerification;
  private revisionValue: number;
  private updatedAtValue: Date;

  private constructor(state: CdcConnectionProfileState) {
    this.validateState(state);
    this.idValue = state.id;
    this.organizationIdValue = state.organizationId;
    this.databaseServiceIdValue = state.databaseServiceId;
    this.connectorTypeValue = state.connectorType;
    this.configValue = state.config;
    this.credentialValue = state.credential;
    this.credentialSchemaVersionValue = state.credentialSchemaVersion;
    this.setupModeValue = state.setupMode;
    this.publicationNameValue = normalizePostgresCdcIdentifier(
      'Publication name',
      state.publicationName,
    );
    this.slotNameValue = normalizePostgresCdcIdentifier('Replication slot name', state.slotName);
    this.verificationValue = state.verification;
    this.revisionValue = state.revision;
    this.createdAtValue = state.createdAt;
    this.updatedAtValue = state.updatedAt;
  }

  public static register(state: CdcConnectionProfileState): CdcConnectionProfile {
    return new CdcConnectionProfile(state);
  }

  public static rehydrate(state: CdcConnectionProfileState): CdcConnectionProfile {
    return new CdcConnectionProfile(state);
  }

  public get id(): CdcConnectionProfileId {
    return this.idValue;
  }

  public get organizationId(): string {
    return this.organizationIdValue;
  }

  public get databaseServiceId(): ConnectionId {
    return this.databaseServiceIdValue;
  }

  public get connectorType(): ConnectorType {
    return this.connectorTypeValue;
  }

  public get config(): NormalizedConnectionConfig {
    return this.configValue;
  }

  public get credential(): CredentialReference {
    return this.credentialValue;
  }

  public get credentialSchemaVersion(): number {
    return this.credentialSchemaVersionValue;
  }

  public get setupMode(): CdcConnectionSetupMode {
    return this.setupModeValue;
  }

  public get publicationName(): string | undefined {
    return this.publicationNameValue;
  }

  public get slotName(): string | undefined {
    return this.slotNameValue;
  }

  public get verification(): CdcConnectionVerification {
    return this.verificationValue;
  }

  public get revision(): number {
    return this.revisionValue;
  }

  public get createdAt(): Date {
    return this.createdAtValue;
  }

  public get updatedAt(): Date {
    return this.updatedAtValue;
  }

  public change(change: ChangeCdcConnectionProfile): boolean {
    const publicationName = normalizePostgresCdcIdentifier(
      'Publication name',
      change.publicationName,
    );
    const slotName = normalizePostgresCdcIdentifier('Replication slot name', change.slotName);
    this.validatePostgresExisting(
      this.connectorTypeValue.value,
      change.setupMode,
      publicationName,
      slotName,
    );
    const changed =
      !this.configValue.equals(change.config) ||
      !this.credentialValue.equals(change.credential) ||
      this.credentialSchemaVersionValue !== change.credentialSchemaVersion ||
      this.setupModeValue !== change.setupMode ||
      this.publicationNameValue !== publicationName ||
      this.slotNameValue !== slotName;
    if (!changed) return false;

    this.configValue = change.config;
    this.credentialValue = change.credential;
    this.credentialSchemaVersionValue = change.credentialSchemaVersion;
    this.setupModeValue = change.setupMode;
    this.publicationNameValue = publicationName;
    this.slotNameValue = slotName;
    this.verificationValue = CdcConnectionVerification.untested();
    this.revisionValue += 1;
    this.updatedAtValue = change.changedAt;
    return true;
  }

  public recordVerificationReady(testedAt: Date): void {
    this.verificationValue = CdcConnectionVerification.ready(testedAt);
    this.revisionValue += 1;
    this.updatedAtValue = testedAt;
  }

  public recordVerificationIssue(
    testedAt: Date,
    status: Exclude<
      CdcConnectionVerificationStatus,
      CdcConnectionVerificationStatus.UNTESTED | CdcConnectionVerificationStatus.READY
    >,
    issueCode: CdcConnectionIssueCode,
    message: string,
  ): void {
    this.verificationValue = CdcConnectionVerification.issue(status, testedAt, issueCode, message);
    this.revisionValue += 1;
    this.updatedAtValue = testedAt;
  }

  private validateState(state: CdcConnectionProfileState): void {
    if (state.organizationId.trim() === '') {
      throw ConnectionError.validation('Organization id is required.');
    }
    if (!Number.isSafeInteger(state.credentialSchemaVersion) || state.credentialSchemaVersion < 1) {
      throw ConnectionError.validation('CDC credential schema version must be positive.');
    }
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
      throw ConnectionError.validation('CDC connection profile revision cannot be negative.');
    }
    this.validatePostgresExisting(
      state.connectorType.value,
      state.setupMode,
      state.publicationName,
      state.slotName,
    );
  }

  private validatePostgresExisting(
    connectorType: string,
    setupMode: CdcConnectionSetupMode,
    publicationName: string | undefined,
    slotName: string | undefined,
  ): void {
    if (connectorType === 'POSTGRESQL') {
      if (setupMode === CdcConnectionSetupMode.EXISTING && publicationName === undefined) {
        throw ConnectionError.validation(
          'PostgreSQL existing CDC setup requires a publication name.',
        );
      }
      if (setupMode === CdcConnectionSetupMode.EXISTING && slotName === undefined) {
        throw ConnectionError.validation(
          'PostgreSQL existing CDC setup requires a replication slot name.',
        );
      }
    }
  }
}

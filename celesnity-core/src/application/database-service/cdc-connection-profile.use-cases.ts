import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { ICdcConnectionPreflight } from '@application/database-service/interfaces/i-cdc-connection-preflight';
import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { ICdcConnectionUsageReader } from '@application/database-service/interfaces/i-cdc-connection-usage-reader';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import {
  toCdcConnectionProfileView,
  type CdcConnectionProfileView,
} from '@application/database-service/read-models/cdc-connection-profile';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import type { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import {
  CdcConnectionProfileId,
  type CdcConnectionSetupMode,
  CdcConnectionVerification,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

export interface PutCdcConnectionProfileCommand {
  readonly databaseServiceId: string;
  readonly details: unknown;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
}

export class CdcConnectionProfileUseCases {
  public constructor(
    private readonly profiles: ICdcConnectionProfileRepository,
    private readonly databaseServices: IDatabaseServiceRepository,
    private readonly credentials: ICredentialVault,
    private readonly connectors: IDatabaseServiceConnectorRegistry,
    private readonly preflight: ICdcConnectionPreflight,
    private readonly usage: ICdcConnectionUsageReader,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async get(databaseServiceIdValue: string): Promise<CdcConnectionProfileView> {
    const profile = await this.requireProfile(databaseServiceIdValue);
    return toCdcConnectionProfileView(profile);
  }

  public async put(command: PutCdcConnectionProfileCommand): Promise<CdcConnectionProfileView> {
    const organizationId = this.contexts.require().organizationId;
    const databaseServiceId = ConnectionId.from(command.databaseServiceId);
    const databaseService = await this.requireDatabaseService(databaseServiceId);
    const connector = this.connectors.require(databaseService.connectorType);
    const existing = await this.profiles.findByDatabaseService(organizationId, databaseServiceId);
    const normalized = connector.configCodec.normalize(command.details, existing?.config);
    const credential =
      normalized.credential === undefined
        ? existing?.credential
        : await this.credentials.encrypt(normalized.credential.value);
    const credentialSchemaVersion =
      normalized.credential?.schemaVersion ?? existing?.credentialSchemaVersion;
    if (credential === undefined || credentialSchemaVersion === undefined) {
      throw ConnectionError.validation('CDC connection credentials are required.');
    }
    const now = this.clock.now();

    if (existing === undefined) {
      const profile = CdcConnectionProfile.register({
        id: CdcConnectionProfileId.from(this.ids.next()),
        organizationId,
        databaseServiceId,
        connectorType: databaseService.connectorType,
        config: normalized.config,
        credential,
        credentialSchemaVersion,
        setupMode: command.setupMode,
        publicationName: command.publicationName,
        slotName: command.slotName,
        verification: CdcConnectionVerification.untested(),
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
      await this.unitOfWork.commit(async () => this.profiles.create(profile));
      return toCdcConnectionProfileView(profile);
    }

    const expectedRevision = existing.revision;
    const changed = existing.change({
      config: normalized.config,
      credential,
      credentialSchemaVersion,
      setupMode: command.setupMode,
      publicationName: command.publicationName,
      slotName: command.slotName,
      changedAt: now,
    });
    if (changed) await this.persist(existing, expectedRevision);
    return toCdcConnectionProfileView(existing);
  }

  public async validate(databaseServiceIdValue: string): Promise<CdcConnectionProfileView> {
    const profile = await this.requireProfile(databaseServiceIdValue);
    const expectedRevision = profile.revision;
    const connector = this.connectors.require(profile.connectorType);
    const restored = connector.configCodec.restore(profile.config);
    const credential = PlaintextCredentialPayload.create(
      profile.credentialSchemaVersion,
      await this.credentials.decrypt(profile.credential),
    );
    const result = await this.preflight.validate({
      databaseServiceId: profile.databaseServiceId.value,
      connectorType: profile.connectorType.value,
      config: restored.config,
      destination: restored.destination,
      credential,
      setupMode: profile.setupMode,
      publicationName: profile.publicationName,
      slotName: profile.slotName,
    });
    const testedAt = this.clock.now();
    if (result.status === CdcConnectionVerificationStatus.READY) {
      profile.recordVerificationReady(testedAt);
    } else {
      profile.recordVerificationIssue(testedAt, result.status, result.issueCode, result.message);
    }
    await this.persist(profile, expectedRevision);
    return toCdcConnectionProfileView(profile);
  }

  public async remove(databaseServiceIdValue: string): Promise<void> {
    const organizationId = this.contexts.require().organizationId;
    const databaseServiceId = ConnectionId.from(databaseServiceIdValue);
    await this.requireDatabaseService(databaseServiceId);
    if (await this.usage.hasActiveCdcSubscriptions(organizationId, databaseServiceId)) {
      throw ConnectionError.cdcProfileInUse();
    }
    await this.unitOfWork.commit(async () => {
      if (!(await this.profiles.delete(organizationId, databaseServiceId))) {
        throw ConnectionError.notFound();
      }
    });
  }

  private async requireProfile(databaseServiceIdValue: string): Promise<CdcConnectionProfile> {
    const organizationId = this.contexts.require().organizationId;
    const databaseServiceId = ConnectionId.from(databaseServiceIdValue);
    await this.requireDatabaseService(databaseServiceId);
    const profile = await this.profiles.findByDatabaseService(organizationId, databaseServiceId);
    if (profile === undefined) throw ConnectionError.notFound();
    return profile;
  }

  private async requireDatabaseService(databaseServiceId: ConnectionId): Promise<DatabaseService> {
    const databaseService = await this.databaseServices.findById(databaseServiceId);
    if (databaseService === undefined) throw ConnectionError.notFound();
    if (databaseService.isArchived) throw ConnectionError.archived();
    return databaseService;
  }

  private async persist(profile: CdcConnectionProfile, expectedRevision: number): Promise<void> {
    await this.unitOfWork.commit(async () => {
      if (!(await this.profiles.update(profile, expectedRevision))) {
        throw ConnectionError.cdcProfileChanged();
      }
    });
  }
}

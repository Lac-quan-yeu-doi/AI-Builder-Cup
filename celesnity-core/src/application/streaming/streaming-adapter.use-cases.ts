import type { IMqttStreamAdapterRepository } from '@application/streaming/interfaces/i-mqtt-stream-adapter.repository';
import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import type { IStreamingCredentialVault } from '@application/streaming/interfaces/i-streaming-credential-vault';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import { StreamingError } from '@domain/streaming/errors/streaming.errors';
import type {
  MqttStreamAdapter,
  MqttStreamAdapterRecord,
  MqttStreamAdapterRegistration,
  StreamAdapterDesiredState,
  StreamingPlacementKind,
} from '@domain/streaming/models/mqtt-stream-adapter';

const EMPTY_NAMESPACE_METADATA: ICatalogNamespaceMetadataRepository = {
  listDescriptions: () => Promise.resolve(new Map()),
  setDescription: () => Promise.resolve(),
};

export interface CreateMqttAdapterInput {
  readonly tenantStorageKey: string;
  readonly tenantDisplayName: string;
  readonly name: string;
  readonly qos: 0 | 1 | 2;
  readonly placementKind?: StreamingPlacementKind;
}

export class StreamingAdapterUseCases {
  public constructor(
    private readonly repository: IMqttStreamAdapterRepository,
    private readonly credentials: IStreamingCredentialVault,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly secrets: IStreamingSecretGenerator,
    private readonly publicEndpoint: string,
    private readonly namespaceMetadata: ICatalogNamespaceMetadataRepository = EMPTY_NAMESPACE_METADATA,
    private readonly catalogName = 'iceberg',
  ) {}

  public list(tenantStorageKey?: string): Promise<readonly MqttStreamAdapter[]> {
    return this.repository.list(tenantStorageKey);
  }

  public async get(id: string): Promise<MqttStreamAdapter> {
    return withoutCredentials(await this.require(id));
  }

  public async create(input: CreateMqttAdapterInput): Promise<MqttStreamAdapterRegistration> {
    const now = this.clock.now();
    const id = this.ids.next();
    const publicKey = `adp_${id.replaceAll('-', '')}`;
    const tenantStorageKey = cleanTenantStorageKey(input.tenantStorageKey);
    const issuedCredential = { username: publicKey, password: this.secrets.generate() };
    const credentialReference = await this.credentials.encrypt(issuedCredential);
    const record: MqttStreamAdapterRecord = {
      id,
      publicKey,
      tenantId: this.ids.next(),
      tenantStorageKey,
      tenantDisplayName: cleanText(input.tenantDisplayName, 'Tenant display name', 160),
      name: cleanText(input.name, 'Adapter name', 160),
      brokerUrl: this.publicEndpoint,
      topicFilter: `tenants/${tenantStorageKey}/adapters/${publicKey}/devices/+/telemetry`,
      qos: input.qos,
      credentials: credentialReference,
      desiredState: 'ACTIVE',
      status: 'PROVISIONING',
      placementKind: input.placementKind ?? 'SHARED',
      deploymentId: input.placementKind === 'DEDICATED' ? `dedicated-${id}` : 'shared-0',
      generation: 1,
      observedGeneration: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return this.unitOfWork.commit(async (events) => {
      const saved = await this.repository.create({ adapter: record });
      if (saved === 'NAME_CONFLICT') throw StreamingError.nameConflict();
      await this.namespaceMetadata.setDescription(
        this.catalogName,
        `${tenantStorageKey}_bronze`,
        `Managed MQTT Bronze events for ${record.tenantDisplayName}.`,
      );
      events.record(this.eventFor(saved, 'MqttStreamAdapterCreated', now));
      return { adapter: withoutCredentials(saved), credential: issuedCredential };
    });
  }

  public pause(id: string): Promise<MqttStreamAdapter> {
    return this.changeDesiredState(id, 'PAUSED', 'MqttStreamAdapterPauseRequested');
  }

  public resume(id: string): Promise<MqttStreamAdapter> {
    return this.changeDesiredState(id, 'ACTIVE', 'MqttStreamAdapterResumeRequested');
  }

  public async archive(id: string): Promise<void> {
    await this.changeDesiredState(id, 'ARCHIVED', 'MqttStreamAdapterArchiveRequested');
  }

  public async rotateCredentials(id: string): Promise<MqttStreamAdapterRegistration> {
    const current = await this.require(id);
    const now = this.clock.now();
    const issuedCredential = { username: current.publicKey, password: this.secrets.generate() };
    const encrypted = await this.credentials.encrypt(issuedCredential);
    return this.unitOfWork.commit(async (events) => {
      const updated = await this.repository.replaceCredentials(id, encrypted, now.toISOString());
      if (updated === undefined) throw StreamingError.notFound();
      events.record(this.eventFor(updated, 'MqttStreamAdapterCredentialsRotated', now));
      return { adapter: withoutCredentials(updated), credential: issuedCredential };
    });
  }

  private async changeDesiredState(
    id: string,
    desiredState: StreamAdapterDesiredState,
    eventName: string,
  ): Promise<MqttStreamAdapter> {
    const current = await this.require(id);
    if (current.desiredState === 'ARCHIVED') {
      throw StreamingError.stateConflict('An archived MQTT adapter cannot change state.');
    }
    const now = this.clock.now();
    return this.unitOfWork.commit(async (events) => {
      const updated = await this.repository.setDesiredState(id, desiredState, now.toISOString());
      if (updated === undefined) throw StreamingError.notFound();
      events.record(this.eventFor(updated, eventName, now));
      return withoutCredentials(updated);
    });
  }

  private async require(id: string): Promise<MqttStreamAdapterRecord> {
    const adapter = await this.repository.findById(id);
    if (adapter === undefined || adapter.status === 'ARCHIVED') throw StreamingError.notFound();
    return adapter;
  }

  private eventFor(
    adapter: MqttStreamAdapterRecord,
    eventName: string,
    occurredAt: Date,
  ): OutboxMessage {
    return {
      id: this.ids.next(),
      aggregateType: 'MqttStreamAdapter',
      aggregateId: adapter.id,
      eventName,
      occurredAt,
      payload: {
        adapterId: adapter.id,
        adapterKey: adapter.publicKey,
        tenantStorageKey: adapter.tenantStorageKey,
        desiredState: adapter.desiredState,
        generation: adapter.generation,
        placementKind: adapter.placementKind,
        deploymentId: adapter.deploymentId,
      },
    };
  }
}

function withoutCredentials(record: MqttStreamAdapterRecord): MqttStreamAdapter {
  const { credentials, ...adapter } = record;
  void credentials;
  return adapter;
}

function cleanTenantStorageKey(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!/^tnt_[a-z0-9]{12,48}$/u.test(cleaned)) {
    throw StreamingError.validation('Tenant storage key must match tnt_[a-z0-9]{12,48}.');
  }
  return cleaned;
}

function cleanText(value: string, field: string, max: number): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > max) {
    throw StreamingError.validation(`${field} must contain between 1 and ${max} characters.`);
  }
  return cleaned;
}

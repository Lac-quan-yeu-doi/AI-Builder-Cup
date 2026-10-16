import type { IMqttStreamAdapterRepository } from '@application/streaming/interfaces/i-mqtt-stream-adapter.repository';
import type { IStreamingCredentialVault } from '@application/streaming/interfaces/i-streaming-credential-vault';
import {
  type CreateMqttAdapterInput,
  StreamingAdapterUseCases,
} from '@application/streaming/streaming-adapter.use-cases';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import type {
  MqttStreamAdapterRecord,
  StreamAdapterDesiredState,
} from '@domain/streaming/models/mqtt-stream-adapter';

describe('StreamingAdapterUseCases', () => {
  it('creates a tenant-scoped managed endpoint and returns its credential once', async () => {
    const fixture = createFixture();
    const created = await fixture.useCases.create({
      tenantStorageKey: 'tnt_7f3a2c19d8e4',
      tenantDisplayName: 'Factory 7',
      name: 'Line A',
      qos: 1,
    });

    expect(created.adapter.publicKey).toBe('adp_00000000000040008000000000000001');
    expect(created.adapter).toMatchObject({
      tenantStorageKey: 'tnt_7f3a2c19d8e4',
      brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
      topicFilter:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_00000000000040008000000000000001/devices/+/telemetry',
    });
    expect(created.credential).toEqual({
      username: 'adp_00000000000040008000000000000001',
      password: 'generated-secret',
    });
    expect(fixture.records[0]?.credentials.ciphertext).toBe('encrypted');
    expect(fixture.events).toHaveLength(1);
    expect(JSON.stringify(fixture.events)).not.toContain('generated-secret');
    expect(fixture.namespaces).toEqual([
      {
        catalog: 'iceberg',
        namespace: 'tnt_7f3a2c19d8e4_bronze',
        description: 'Managed MQTT Bronze events for Factory 7.',
      },
    ]);
  });

  it('increments desired-state generation for asynchronous pause and resume', async () => {
    const fixture = createFixture();
    const created = await fixture.useCases.create(validInput());
    const paused = await fixture.useCases.pause(created.adapter.id);
    const resumed = await fixture.useCases.resume(created.adapter.id);

    expect(paused).toMatchObject({ desiredState: 'PAUSED', status: 'PROVISIONING', generation: 2 });
    expect(resumed).toMatchObject({
      desiredState: 'ACTIVE',
      status: 'PROVISIONING',
      generation: 3,
    });
  });

  it('rejects tenant keys outside the managed topic namespace', async () => {
    const fixture = createFixture();
    await expect(
      fixture.useCases.create({ ...validInput(), tenantStorageKey: 'tenant-7' }),
    ).rejects.toMatchObject({ code: 'STREAM_ADAPTER_INVALID' });
  });
});

function validInput(): CreateMqttAdapterInput {
  return {
    tenantStorageKey: 'tnt_7f3a2c19d8e4',
    tenantDisplayName: 'Factory 7',
    name: 'Line A',
    qos: 1 as const,
  };
}

function createFixture(): {
  readonly events: OutboxMessage[];
  readonly records: MqttStreamAdapterRecord[];
  readonly namespaces: Array<{
    readonly catalog: string;
    readonly namespace: string;
    readonly description: string | undefined;
  }>;
  readonly useCases: StreamingAdapterUseCases;
} {
  const records: MqttStreamAdapterRecord[] = [];
  const events: OutboxMessage[] = [];
  const namespaces: Array<{
    readonly catalog: string;
    readonly namespace: string;
    readonly description: string | undefined;
  }> = [];
  const repository: IMqttStreamAdapterRepository = {
    list: () => Promise.resolve(records),
    findById: (id) => Promise.resolve(records.find((record) => record.id === id)),
    create: ({ adapter }) => {
      records.push(adapter);
      return Promise.resolve(adapter);
    },
    setDesiredState: (id, desiredState, updatedAt) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return Promise.resolve(undefined);
      records[index] = transition(records[index]!, desiredState, updatedAt);
      return Promise.resolve(records[index]);
    },
    replaceCredentials: () => Promise.resolve(undefined),
    claimReconciliation: () => Promise.resolve([]),
    completeReconciliation: () => Promise.resolve(),
    failReconciliation: () => Promise.resolve(),
  };
  const vault: IStreamingCredentialVault = {
    encrypt: () =>
      Promise.resolve({
        ciphertext: 'encrypted',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      }),
    decrypt: () => Promise.resolve({}),
  };
  const unitOfWork: IUnitOfWork = {
    commit: async (work) => work({ record: (...messages) => events.push(...messages) }),
  };
  let sequence = 0;
  const useCases = new StreamingAdapterUseCases(
    repository,
    vault,
    unitOfWork,
    { now: (): Date => new Date('2026-08-12T00:00:00.000Z') },
    {
      next: (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
    { generate: (): string => 'generated-secret' },
    'mqtts://mqtt.celesnity.test:8883',
    {
      listDescriptions: () => Promise.resolve(new Map()),
      setDescription: (catalog, namespace, description) => {
        namespaces.push({ catalog, namespace, description });
        return Promise.resolve();
      },
    },
    'iceberg',
  );
  return { events, namespaces, records, useCases };
}

function transition(
  record: MqttStreamAdapterRecord,
  desiredState: StreamAdapterDesiredState,
  updatedAt: string,
): MqttStreamAdapterRecord {
  return {
    ...record,
    desiredState,
    status: 'PROVISIONING',
    generation: record.generation + 1,
    updatedAt,
  };
}

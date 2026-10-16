import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { DeviceConfigurationUseCases } from '@application/device-management/device-configuration.use-cases';
import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { DeviceRecord } from '@domain/device-management/models/device';
import type {
  DeviceConfiguration,
  DeviceConfigurationRecord,
  DeviceConfigurationStatus,
  DeviceConfigurationTemplate,
} from '@domain/device-management/models/device-configuration';

const NOW = '2026-09-06T00:00:00.000Z';

describe('DeviceConfigurationUseCases', () => {
  it('creates a monotonically versioned retained configuration command', async () => {
    const fixture = createFixture();

    const configuration = await fixture.useCases.push(fixture.device.id, {
      parameters: {
        samplingRateHz: 2,
        reportingIntervalSeconds: 60,
        channels: { temperature: true, vibration: false },
      },
    });

    expect(configuration).toMatchObject({ version: 4, status: 'DISPATCHED' });
    expect(fixture.publisher.publish).toHaveBeenCalledWith(
      fixture.device,
      expect.objectContaining({ version: 4, previousAppliedVersion: 3 }),
    );
  });

  it('marks configuration applied only after a token-authenticated acknowledgement', async () => {
    const fixture = createFixture();
    const configuration = await fixture.useCases.push(fixture.device.id, {
      parameters: { diagnosticLogging: ['CPU_LOAD', 'UPTIME'] },
    });

    await expect(
      fixture.useCases.reportEvent(configuration.id, { token: 'wrong', status: 'APPLIED' }),
    ).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });

    const applied = await fixture.useCases.reportEvent(configuration.id, {
      token: 'event-secret',
      status: 'APPLIED',
    });

    expect(applied.status).toBe('APPLIED');
    expect(fixture.publisher.clear).toHaveBeenCalledWith(fixture.device);
  });

  it('rejects invalid or empty configurations', async () => {
    const fixture = createFixture();

    await expect(fixture.useCases.push(fixture.device.id, {})).rejects.toMatchObject({
      code: 'DEVICE_INVALID',
    });
    await expect(
      fixture.useCases.push(fixture.device.id, {
        parameters: { alertThresholds: { battery: Number.NaN } },
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_INVALID' });
  });

  it('creates immutable template versions within the organization', async () => {
    const fixture = createFixture();

    const template = await fixture.useCases.createTemplate({
      name: ' Factory sensors ',
      parameters: { samplingRateHz: 2, logLevel: 'WARNING' },
    });

    expect(template).toMatchObject({
      name: 'Factory sensors',
      version: 1,
      organizationId: fixture.device.organizationId,
      createdBy: 'local-owner',
    });
  });

  it('snapshots matching active devices and pushes one version to each target', async () => {
    const fixture = createFixture();
    const template = await fixture.useCases.createTemplate({
      name: 'Factory sensors',
      parameters: { reportingIntervalSeconds: 60 },
    });
    fixture.listConfigurationTargets.mockResolvedValue([
      fixture.device,
      { ...fixture.device, id: '99999999-9999-4999-8999-999999999999', name: 'Gateway 2' },
    ]);

    const result = await fixture.useCases.deployTemplate(template.id, {
      deploymentSite: ' Factory 2 ',
      deviceType: 'GATEWAY',
    });

    expect(fixture.listConfigurationTargets).toHaveBeenCalledWith({
      deploymentSite: 'Factory 2',
      deviceType: 'GATEWAY',
    });
    expect(result).toMatchObject({ targetCount: 2, failures: [] });
    expect(result.configurations).toHaveLength(2);
    expect(fixture.publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('requires a bounded target and reports per-device dispatch failures', async () => {
    const fixture = createFixture();
    const template = await fixture.useCases.createTemplate({
      name: 'Factory sensors',
      parameters: { samplingRateHz: 1 },
    });
    fixture.listConfigurationTargets.mockResolvedValue([fixture.device]);
    fixture.publisher.publish.mockRejectedValueOnce(new Error('broker offline'));

    await expect(fixture.useCases.deployTemplate(template.id, {})).rejects.toMatchObject({
      code: 'DEVICE_INVALID',
    });
    const result = await fixture.useCases.deployTemplate(template.id, { deviceType: 'GATEWAY' });

    expect(result.configurations).toHaveLength(0);
    expect(result.failures).toEqual([
      { deviceId: fixture.device.id, deviceName: fixture.device.name, error: expect.any(String) },
    ]);
  });
});

function createFixture(): {
  readonly useCases: DeviceConfigurationUseCases;
  readonly device: DeviceRecord;
  readonly publisher: jest.Mocked<IDeviceConfigurationCommandPublisher>;
  readonly listConfigurationTargets: jest.Mock;
} {
  const device = activeDevice();
  let stored: DeviceConfigurationRecord | undefined;
  const templates: DeviceConfigurationTemplate[] = [];
  const repository: IDeviceConfigurationRepository = {
    nextVersion: jest.fn().mockResolvedValue(4),
    create: jest.fn((record: DeviceConfigurationRecord) => {
      stored = record;
      return Promise.resolve(withoutToken(record));
    }),
    list: jest.fn().mockResolvedValue([]),
    findTimedOut: jest.fn().mockResolvedValue([]),
    findById: jest.fn(() => Promise.resolve(stored)),
    confirmApplied: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn(
      (
        _id: string,
        _expected: DeviceConfigurationStatus,
        status: DeviceConfigurationStatus,
        now: string,
        error?: string,
      ) => {
        if (stored === undefined) return Promise.resolve(undefined);
        stored = { ...stored, status, updatedAt: now, ...(error === undefined ? {} : { error }) };
        return Promise.resolve(withoutToken(stored));
      },
    ),
    nextTemplateVersion: jest.fn().mockResolvedValue(1),
    createTemplate: jest.fn((template) => {
      templates.push(template);
      return Promise.resolve(template);
    }),
    listTemplates: jest.fn().mockResolvedValue([]),
    findTemplateById: jest.fn((id) =>
      Promise.resolve(templates.find((template) => template.id === id)),
    ),
  };
  const publisher: jest.Mocked<IDeviceConfigurationCommandPublisher> = {
    publish: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const unitOfWork: IUnitOfWork = {
    commit: async (work) => work({ record: jest.fn() }),
  };
  const listConfigurationTargets = jest.fn().mockResolvedValue([]);
  const devices = {
    findById: jest.fn().mockResolvedValue(device),
    listConfigurationTargets,
  } as unknown as IDeviceRepository;
  const contexts = {
    require: () => ({ identityId: 'local-owner', organizationId: device.organizationId }),
  } as unknown as AuthenticatedContextStore;
  return {
    device,
    publisher,
    listConfigurationTargets,
    useCases: new DeviceConfigurationUseCases(
      repository,
      devices,
      publisher,
      unitOfWork,
      { now: () => new Date(NOW) },
      { next: () => '44444444-4444-4444-8444-444444444444' },
      { generate: () => 'event-secret' },
      contexts,
    ),
  };
}

function activeDevice(): DeviceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '55555555-5555-4555-8555-555555555555',
    publicKey: 'dev_1',
    adapterId: '22222222-2222-4222-8222-222222222222',
    adapterKey: 'adp',
    tenantId: '33333333-3333-4333-8333-333333333333',
    tenantStorageKey: 'tnt',
    externalDeviceId: 'gateway-1',
    deviceType: 'GATEWAY',
    name: 'Gateway',
    model: 'GW-1',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtt://localhost:1883',
    topics: {
      telemetry: 'tenants/tnt/adapters/adp/devices/device-1/telemetry',
      firmwareEvents: 'tenants/tnt/adapters/adp/devices/device-1/events/firmware',
      firmwareCommands: 'tenants/tnt/adapters/adp/devices/device-1/commands/firmware',
    },
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 3,
    appliedConfigurationVersion: 3,
    reportedConfigurationVersion: 3,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function withoutToken(record: DeviceConfigurationRecord): DeviceConfiguration {
  const { eventTokenHash, ...configuration } = record;
  void eventTokenHash;
  return configuration;
}

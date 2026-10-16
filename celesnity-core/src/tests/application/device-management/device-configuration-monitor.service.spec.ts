import { backgroundContexts } from '../administration/background-principal.fixture';
import { DeviceConfigurationMonitorService } from '@application/device-management/device-configuration-monitor.service';
import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { DeviceConfigurationRecord } from '@domain/device-management/models/device-configuration';
import type { DeviceRecord } from '@domain/device-management/models/device';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('DeviceConfigurationMonitorService', () => {
  it('rolls back a dispatched configuration that misses its confirmation window', async () => {
    const contexts = backgroundContexts();
    const configuration = dispatchedConfiguration();
    const device = activeDevice();
    const updateStatus = jest.fn(async () => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      return { ...configuration, status: 'ROLLED_BACK' as const };
    });
    const configurations = {
      findTimedOut: jest.fn().mockResolvedValue([configuration]),
      updateStatus,
    } as unknown as IDeviceConfigurationRepository;
    const devices = {
      findById: jest.fn().mockResolvedValue(device),
    } as unknown as IDeviceRepository;
    const publisher = {
      clear: jest.fn().mockResolvedValue(undefined),
    } as unknown as IDeviceConfigurationCommandPublisher;
    const unitOfWork: IUnitOfWork = { commit: async (work) => work({ record: jest.fn() }) };
    const monitor = new DeviceConfigurationMonitorService(
      configurations,
      devices,
      publisher,
      unitOfWork,
      { now: () => NOW },
      contexts,
      { info: jest.fn(), error: jest.fn() },
      300,
      100,
    );

    await expect(monitor.monitorOnce()).resolves.toBe(1);
    expect(configurations.findTimedOut).toHaveBeenCalledWith(100, '2026-09-06T11:55:00.000Z');
    expect(publisher.clear).toHaveBeenCalledWith(device);
    expect(updateStatus).toHaveBeenCalledWith(
      configuration.id,
      'DISPATCHED',
      'ROLLED_BACK',
      NOW.toISOString(),
      'Device did not confirm configuration within the allowed window.',
    );
    expect(contexts.current()).toBeUndefined();
  });

  it('rolls back an applied configuration that periodic telemetry never confirms', async () => {
    const contexts = backgroundContexts();
    const configuration: DeviceConfigurationRecord = {
      ...dispatchedConfiguration(),
      status: 'APPLIED',
      appliedAt: '2026-09-06T11:50:00.000Z',
    };
    const device = { ...activeDevice(), appliedConfigurationVersion: 4 };
    const updateStatus = jest.fn().mockResolvedValue({
      ...configuration,
      status: 'ROLLED_BACK',
    });
    const configurations = {
      findTimedOut: jest.fn().mockResolvedValue([configuration]),
      updateStatus,
    } as unknown as IDeviceConfigurationRepository;
    const devices = {
      findById: jest.fn().mockResolvedValue(device),
    } as unknown as IDeviceRepository;
    const publisher = {
      clear: jest.fn().mockResolvedValue(undefined),
    } as unknown as IDeviceConfigurationCommandPublisher;
    const unitOfWork: IUnitOfWork = { commit: async (work) => work({ record: jest.fn() }) };
    const monitor = new DeviceConfigurationMonitorService(
      configurations,
      devices,
      publisher,
      unitOfWork,
      { now: () => NOW },
      contexts,
      { info: jest.fn(), error: jest.fn() },
      300,
      100,
    );

    await expect(monitor.monitorOnce()).resolves.toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      configuration.id,
      'APPLIED',
      'ROLLED_BACK',
      NOW.toISOString(),
      'Device did not confirm configuration within the allowed window.',
    );
  });

  it('keeps an applied configuration once periodic telemetry reports its version', async () => {
    const configuration: DeviceConfigurationRecord = {
      ...dispatchedConfiguration(),
      status: 'APPLIED',
      appliedAt: '2026-09-06T11:50:00.000Z',
    };
    const configurations = {
      findTimedOut: jest.fn().mockResolvedValue([configuration]),
      updateStatus: jest.fn(),
    } as unknown as IDeviceConfigurationRepository;
    const devices = {
      findById: jest.fn().mockResolvedValue({
        ...activeDevice(),
        appliedConfigurationVersion: 4,
        reportedConfigurationVersion: 4,
      }),
    } as unknown as IDeviceRepository;
    const publisher = { clear: jest.fn() } as unknown as IDeviceConfigurationCommandPublisher;
    const monitor = new DeviceConfigurationMonitorService(
      configurations,
      devices,
      publisher,
      { commit: async (work) => work({ record: jest.fn() }) },
      { now: () => NOW },
      backgroundContexts(),
      { info: jest.fn(), error: jest.fn() },
      300,
      100,
    );

    await expect(monitor.monitorOnce()).resolves.toBe(1);
    expect(publisher.clear).not.toHaveBeenCalled();
    expect(configurations.updateStatus).not.toHaveBeenCalled();
  });
});

function dispatchedConfiguration(): DeviceConfigurationRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: ORGANIZATION_ID,
    deviceId: '33333333-3333-4333-8333-333333333333',
    version: 4,
    status: 'DISPATCHED',
    parameters: { reportingIntervalSeconds: 30 },
    restoreFactoryDefaults: false,
    previousAppliedVersion: 3,
    eventTokenHash: 'hash',
    requestedBy: '44444444-4444-4444-8444-444444444444',
    requestedAt: '2026-09-06T11:49:00.000Z',
    dispatchedAt: '2026-09-06T11:50:00.000Z',
    updatedAt: '2026-09-06T11:50:00.000Z',
  };
}

function activeDevice(): DeviceRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: ORGANIZATION_ID,
    publicKey: 'dev_gateway',
    adapterId: '55555555-5555-4555-8555-555555555555',
    adapterKey: 'adp_factory',
    tenantId: '66666666-6666-4666-8666-666666666666',
    tenantStorageKey: 'tnt_factory',
    externalDeviceId: 'gateway-1',
    deviceType: 'GATEWAY',
    name: 'Factory gateway',
    model: 'CEL-GW100',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtts://mqtt.example.test:8883',
    topics: { telemetry: 'telemetry', firmwareEvents: 'events', firmwareCommands: 'commands' },
    qos: 1,
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 4,
    appliedConfigurationVersion: 3,
    reportedConfigurationVersion: 3,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T11:50:00.000Z',
  };
}

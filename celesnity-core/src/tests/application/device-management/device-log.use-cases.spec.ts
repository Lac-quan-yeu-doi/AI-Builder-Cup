import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { DeviceLogUseCases } from '@application/device-management/device-log.use-cases';
import type { IDeviceLogRepository } from '@application/device-management/interfaces/i-device-log.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { DeviceRecord } from '@domain/device-management/models/device';
import type { DeviceLogEntry } from '@domain/device-management/models/device-log';

const ORGANIZATION_ID = '55555555-5555-4555-8555-555555555555';
const GATEWAY_ID = '11111111-1111-4111-8111-111111111111';
const SENSOR_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-09-06T12:00:00.000Z';

describe('DeviceLogUseCases', () => {
  it('accepts an authenticated gateway log and preserves its device timestamp', async () => {
    const fixture = createFixture();

    const entry = await fixture.useCases.report(fixture.principal, {
      deviceId: GATEWAY_ID,
      eventId: EVENT_ID,
      level: 'WARNING',
      kind: 'OPERATIONAL',
      message: '  LTE reconnect required  ',
      context: { retry: 2 },
      observedAt: '2026-09-06T11:59:30+00:00',
    });

    expect(entry).toMatchObject({
      deviceId: GATEWAY_ID,
      sourceEventId: EVENT_ID,
      message: 'LTE reconnect required',
      observedAt: '2026-09-06T11:59:30.000Z',
      receivedAt: NOW,
    });
  });

  it('allows a gateway to report a bound sensor fault with crash diagnostics', async () => {
    const fixture = createFixture();

    const entry = await fixture.useCases.report(fixture.principal, {
      deviceId: SENSOR_ID,
      eventId: EVENT_ID,
      level: 'ERROR',
      kind: 'FAULT',
      message: 'Watchdog reset',
      context: {
        resetReason: 'WATCHDOG',
        programCounter: '0x400d1234',
        stack: ['0x400d1234', '0x400812ab'],
        firmwareVersion: '1.2.3',
      },
      observedAt: NOW,
    });

    expect(entry.deviceId).toBe(SENSOR_ID);
    expect(entry.context).toMatchObject({ resetReason: 'WATCHDOG', firmwareVersion: '1.2.3' });
  });

  it('returns the existing record when an offline replay repeats its source event', async () => {
    const fixture = createFixture();
    const input = {
      deviceId: GATEWAY_ID,
      eventId: EVENT_ID,
      level: 'INFO' as const,
      kind: 'OPERATIONAL' as const,
      message: 'Boot completed',
      context: {},
      observedAt: NOW,
    };

    const first = await fixture.useCases.report(fixture.principal, input);
    const replay = await fixture.useCases.report(fixture.principal, input);

    expect(replay).toEqual(first);
    expect(fixture.entries).toHaveLength(1);
  });

  it('rejects a sensor that is not bound to the authenticated gateway', async () => {
    const fixture = createFixture();
    const unbound = activeDevice('99999999-9999-4999-8999-999999999999', 'SENSOR');
    fixture.devices.set(unbound.id, unbound);

    await expect(
      fixture.useCases.report(fixture.principal, {
        deviceId: unbound.id,
        eventId: EVENT_ID,
        level: 'ERROR',
        kind: 'FAULT',
        message: 'Unexpected reset',
        context: {},
        observedAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_INVALID' });
  });

  it('passes bounded filters to the tenant-scoped repository', async () => {
    const fixture = createFixture();

    await fixture.useCases.list(SENSOR_ID, { level: 'ERROR', kind: 'FAULT', limit: 25 });

    expect(fixture.repository.list).toHaveBeenCalledWith({
      deviceId: SENSOR_ID,
      level: 'ERROR',
      kind: 'FAULT',
      limit: 25,
    });
    await expect(fixture.useCases.list(SENSOR_ID, { limit: 501 })).rejects.toMatchObject({
      code: 'DEVICE_INVALID',
    });
  });
});

function createFixture(): {
  readonly useCases: DeviceLogUseCases;
  readonly principal: { deviceId: string; organizationId: string; deviceType: 'GATEWAY' };
  readonly sensor: DeviceRecord;
  readonly devices: Map<string, DeviceRecord>;
  readonly entries: DeviceLogEntry[];
  readonly repository: jest.Mocked<IDeviceLogRepository>;
} {
  const gateway = activeDevice(GATEWAY_ID, 'GATEWAY');
  const sensor = { ...activeDevice(SENSOR_ID, 'SENSOR'), gatewayId: GATEWAY_ID };
  const devices = new Map<string, DeviceRecord>([
    [gateway.id, gateway],
    [sensor.id, sensor],
  ]);
  const entries: DeviceLogEntry[] = [];
  const repository: jest.Mocked<IDeviceLogRepository> = {
    create: jest.fn((entry) => {
      if (entries.some((candidate) => candidate.sourceEventId === entry.sourceEventId)) {
        return Promise.resolve('SOURCE_EVENT_CONFLICT');
      }
      entries.push(entry);
      return Promise.resolve(entry);
    }),
    findBySourceEventId: jest.fn((sourceEventId) =>
      Promise.resolve(entries.find((entry) => entry.sourceEventId === sourceEventId)),
    ),
    list: jest.fn().mockResolvedValue([]),
  };
  const deviceRepository = {
    findById: (id: string) => Promise.resolve(devices.get(id)),
  } as unknown as IDeviceRepository;
  const contexts = {
    runBackground: (_organizationId: string, work: () => Promise<unknown>) => work(),
  } as unknown as AuthenticatedContextStore;
  return {
    sensor,
    devices,
    entries,
    repository,
    principal: { deviceId: GATEWAY_ID, organizationId: ORGANIZATION_ID, deviceType: 'GATEWAY' },
    useCases: new DeviceLogUseCases(
      repository,
      deviceRepository,
      { now: () => new Date(NOW) },
      { next: () => '44444444-4444-4444-8444-444444444444' },
      contexts,
    ),
  };
}

function activeDevice(id: string, deviceType: 'GATEWAY' | 'SENSOR'): DeviceRecord {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    publicKey: `dev_${id}`,
    adapterId: '77777777-7777-4777-8777-777777777777',
    adapterKey: 'factory',
    tenantId: '88888888-8888-4888-8888-888888888888',
    tenantStorageKey: 'tenant',
    externalDeviceId: id,
    deviceType,
    name: deviceType === 'GATEWAY' ? 'Gateway' : 'Temperature sensor',
    model: deviceType === 'GATEWAY' ? 'GW-1' : 'TH-1',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtt://localhost:1883',
    topics: {
      telemetry: 'telemetry',
      firmwareEvents: 'firmware/events',
      firmwareCommands: 'firmware/commands',
    },
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 0,
    appliedConfigurationVersion: 0,
    reportedConfigurationVersion: 0,
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

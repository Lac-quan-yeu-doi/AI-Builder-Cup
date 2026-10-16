import { ConfigService } from '@nestjs/config';

import type { DeviceRecord } from '@domain/device-management/models/device';
import { EmqxDevicePrincipalProvisioner } from '@infrastructure/device-management/emqx-device-principal.provisioner';

describe('EmqxDevicePrincipalProvisioner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allows only the registered device topics', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(undefined, { status: 201 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 404 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 201 }));

    const sensorTopic =
      'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-bound/telemetry';
    await provisioner().apply(device(), { username: 'dev_abc123abc123', password: 'secret' }, [
      device().topics.telemetry,
      sensorTopic,
    ]);

    const body = fetchMock.mock.calls[2]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON authorization body.');
    const authorization = JSON.parse(body) as Array<{ rules: unknown[] }>;
    expect(authorization[0]?.rules).toEqual([
      {
        topic: 'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001/telemetry',
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic: sensorTopic,
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001/events/configuration',
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001/commands/configuration',
        permission: 'allow',
        action: 'subscribe',
        qos: [1],
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-bound/events/configuration',
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-bound/commands/configuration',
        permission: 'allow',
        action: 'subscribe',
        qos: [1],
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001/events/firmware',
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001/commands/firmware',
        permission: 'allow',
        action: 'subscribe',
        qos: [1],
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-bound/events/firmware',
        permission: 'allow',
        action: 'publish',
        qos: [1],
        retain: false,
      },
      {
        topic:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-bound/commands/firmware',
        permission: 'allow',
        action: 'subscribe',
        qos: [1],
      },
      { topic: '#', permission: 'deny', action: 'all' },
    ]);
    expect(JSON.stringify(authorization)).not.toContain('devices/+');
  });

  it('revokes the device principal when suspended', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 204 }));

    await provisioner().apply(
      { ...device(), desiredState: 'SUSPENDED' },
      { username: 'dev_abc123abc123', password: 'secret' },
      [],
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === 'DELETE')).toBe(true);
  });

  it('revokes rather than provisioning a direct MQTT principal for a sensor', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 204 }));

    await provisioner().apply(
      { ...device(), deviceType: 'SENSOR' },
      { username: 'dev_abc123abc123', password: 'secret' },
      [],
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === 'DELETE')).toBe(true);
  });
});

function provisioner(): EmqxDevicePrincipalProvisioner {
  return new EmqxDevicePrincipalProvisioner(
    new ConfigService({
      EMQX_API_URL: 'http://emqx:18083/api/v5',
      EMQX_API_KEY: 'celesnity-core',
      EMQX_API_SECRET: 'api-secret',
    }),
  );
}

function device(): DeviceRecord {
  const base = 'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/sensor-001';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '44444444-4444-4444-8444-444444444444',
    publicKey: 'dev_abc123abc123',
    adapterId: '22222222-2222-4222-8222-222222222222',
    adapterKey: 'adp_abc123abc123',
    tenantId: '33333333-3333-4333-8333-333333333333',
    tenantStorageKey: 'tnt_7f3a2c19d8e4',
    externalDeviceId: 'sensor-001',
    deviceType: 'GATEWAY',
    name: 'Temperature sensor',
    model: 'Edge Sensor',
    brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
    topics: {
      telemetry: `${base}/telemetry`,
      firmwareEvents: `${base}/events/firmware`,
      firmwareCommands: `${base}/commands/firmware`,
    },
    qos: 1,
    lifecycleState: 'MANUFACTURED',
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    desiredState: 'ACTIVE',
    status: 'PROVISIONING',
    generation: 1,
    observedGeneration: 0,
    desiredConfigurationVersion: 0,
    appliedConfigurationVersion: 0,
    reportedConfigurationVersion: 0,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'NEVER_SEEN',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

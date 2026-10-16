import { ConfigService } from '@nestjs/config';

import type { Device } from '@domain/device-management/models/device';
import { EmqxDeviceConfigurationCommandPublisher } from '@infrastructure/device-management/emqx-device-configuration-command.publisher';

describe('EmqxDeviceConfigurationCommandPublisher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retains the latest versioned command on the exact device topic', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 200 }));
    await publisher().publish(device(), {
      configurationId: '22222222-2222-4222-8222-222222222222',
      version: 3,
      parameters: { samplingRateHz: 2, reportingIntervalSeconds: 60 },
      restoreFactoryDefaults: false,
      previousAppliedVersion: 2,
      eventPath: '/device-management/device-configurations/222/events',
      eventToken: 'one-time-secret',
    });

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Expected JSON publish body.');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      topic: 'tenants/tnt/adapters/adp/devices/device-1/commands/configuration',
      qos: 1,
      retain: true,
    });
    expect(JSON.parse(String(body.payload))).toMatchObject({
      type: 'configuration.apply',
      version: 3,
    });
  });

  it('clears the retained command after a terminal acknowledgement', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 200 }));

    await publisher().clear(device());

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Expected JSON publish body.');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(body).toMatchObject({ retain: true, payload: '' });
  });
});

function publisher(): EmqxDeviceConfigurationCommandPublisher {
  return new EmqxDeviceConfigurationCommandPublisher(
    new ConfigService({
      EMQX_API_URL: 'http://emqx:18083/api/v5',
      EMQX_API_KEY: 'celesnity-core',
      EMQX_API_SECRET: 'secret',
    }),
  );
}

function device(): Device {
  return {
    id: '11111111-1111-4111-8111-111111111111',
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
    desiredConfigurationVersion: 2,
    appliedConfigurationVersion: 2,
    reportedConfigurationVersion: 2,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
}

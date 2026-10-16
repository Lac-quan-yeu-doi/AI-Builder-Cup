import { ConfigService } from '@nestjs/config';

import type { Device } from '@domain/device-management/models/device';
import { EmqxFirmwareCommandPublisher } from '@infrastructure/device-management/emqx-firmware-command.publisher';

describe('EmqxFirmwareCommandPublisher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('publishes a non-retained QoS command only to the device command topic', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 202 }));
    const publisher = new EmqxFirmwareCommandPublisher(
      new ConfigService({
        EMQX_API_URL: 'http://emqx:18083/api/v5',
        EMQX_API_KEY: 'core-api',
        EMQX_API_SECRET: 'secret',
      }),
    );

    await publisher.publish(device(), {
      deploymentId: '22222222-2222-4222-8222-222222222222',
      version: '1.2.0',
      artifactUrl: 'https://firmware.example.test/sensor/1.2.0.bin',
      artifactSizeBytes: 4096,
      sha256: 'a'.repeat(64),
      signatureAlgorithm: 'ED25519',
      signature: 'A'.repeat(88),
      signingKeyId: 'release-primary',
      signaturePayload:
        '{"schemaVersion":1,"version":"1.2.0","deviceModel":"Edge Sensor","hardwareRevision":null,"artifactSizeBytes":4096,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      deviceModel: 'Edge Sensor',
      eventPath:
        '/device-management/firmware-deployments/22222222-2222-4222-8222-222222222222/events',
      eventToken: 'one-time-event-token',
      download: { resumable: true, chunkSizeBytes: 262144 },
      boot: { strategy: 'A_B', confirmationTimeoutSeconds: 300 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://emqx:18083/api/v5/publish');
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON publish body.');
    const envelope = JSON.parse(body) as {
      topic: string;
      qos: number;
      retain: boolean;
      payload: string;
    };
    expect(envelope).toMatchObject({
      topic: 'tenant/device/commands/firmware',
      qos: 1,
      retain: false,
    });
    expect(JSON.parse(envelope.payload)).toMatchObject({
      type: 'firmware.install',
      deploymentId: '22222222-2222-4222-8222-222222222222',
      eventToken: 'one-time-event-token',
      artifactSizeBytes: 4096,
      signatureAlgorithm: 'ED25519',
      download: { resumable: true, chunkSizeBytes: 262144 },
      boot: { strategy: 'A_B', confirmationTimeoutSeconds: 300 },
    });
  });
});

function device(): Device {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicKey: 'dev_sensor',
    adapterId: '33333333-3333-4333-8333-333333333333',
    adapterKey: 'adp_factory',
    tenantId: '44444444-4444-4444-8444-444444444444',
    tenantStorageKey: 'tnt_factory',
    externalDeviceId: 'sensor-001',
    deviceType: 'GATEWAY',
    name: 'Sensor',
    model: 'Edge Sensor',
    brokerUrl: 'mqtt://emqx:1883',
    topics: {
      telemetry: 'tenant/device/telemetry',
      firmwareEvents: 'tenant/device/events/firmware',
      firmwareCommands: 'tenant/device/commands/firmware',
    },
    qos: 1,
    lifecycleState: 'COMMISSIONED',
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
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  };
}

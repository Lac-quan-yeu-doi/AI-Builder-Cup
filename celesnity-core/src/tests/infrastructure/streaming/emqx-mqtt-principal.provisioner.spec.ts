import { ConfigService } from '@nestjs/config';

import type { MqttStreamAdapterRecord } from '@domain/streaming/models/mqtt-stream-adapter';
import { EmqxMqttPrincipalProvisioner } from '@infrastructure/streaming/emqx-mqtt-principal.provisioner';

describe('EmqxMqttPrincipalProvisioner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a managed principal and restricts it to the adapter publish topic', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(undefined, { status: 201 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 404 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 201 }));

    await provisioner().apply(adapter(), { username: 'adp_abc123abc123', password: 'secret' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://emqx:18083/api/v5/authentication/password_based%3Abuilt_in_database/users',
    );
    const authorizationBody = fetchMock.mock.calls[2]?.[1]?.body;
    if (typeof authorizationBody !== 'string') throw new Error('Expected JSON request body.');
    const authorization = JSON.parse(authorizationBody) as unknown;
    expect(authorization).toEqual([
      {
        username: 'adp_abc123abc123',
        rules: [
          {
            permission: 'allow',
            action: 'publish',
            topic: 'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/+/telemetry',
            qos: [1],
            retain: 'all',
          },
          { permission: 'deny', action: 'all', topic: '#' },
        ],
      },
    ]);
    expect(JSON.stringify(fetchMock.mock.calls)).toContain('Basic ');
  });

  it('revokes authentication and authorization when an adapter is paused', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(undefined, { status: 204 }));

    await provisioner().apply(
      { ...adapter(), desiredState: 'PAUSED' },
      {
        username: 'adp_abc123abc123',
        password: 'secret',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === 'DELETE')).toBe(true);
  });
});

function provisioner(): EmqxMqttPrincipalProvisioner {
  return new EmqxMqttPrincipalProvisioner(
    new ConfigService({
      EMQX_API_URL: 'http://emqx:18083/api/v5',
      EMQX_API_KEY: 'celesnity-core',
      EMQX_API_SECRET: 'api-secret',
    }),
  );
}

function adapter(): MqttStreamAdapterRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicKey: 'adp_abc123abc123',
    tenantId: '22222222-2222-4222-8222-222222222222',
    tenantStorageKey: 'tnt_7f3a2c19d8e4',
    tenantDisplayName: 'Factory 7',
    name: 'Line A',
    brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
    topicFilter: 'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/+/telemetry',
    qos: 1,
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    desiredState: 'ACTIVE',
    status: 'PROVISIONING',
    placementKind: 'SHARED',
    deploymentId: 'shared-0',
    generation: 1,
    observedGeneration: 0,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

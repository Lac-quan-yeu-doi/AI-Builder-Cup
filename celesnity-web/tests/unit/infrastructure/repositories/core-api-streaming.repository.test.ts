import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiStreamingRepository } from '@/src/infrastructure/repositories/core-api-streaming.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { path: string; init?: RequestInit }[] = [];
  public constructor(private readonly response: unknown) {}
  public request<T>(path: string, init?: RequestInit): Promise<T> {
    this.requests.push({ path, ...(init === undefined ? {} : { init }) });
    return Promise.resolve(this.response as T);
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const adapter = {
  id: '11111111-1111-4111-8111-111111111111',
  adapterKey: 'adp_11111111111111111111111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  tenantStorageKey: 'tnt_7f3a2c19d8e4',
  tenantDisplayName: 'Factory 7',
  name: 'Line A',
  brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
  topicFilter:
    'tenants/tnt_7f3a2c19d8e4/adapters/adp_11111111111111111111111111111111/devices/+/telemetry',
  qos: 1 as const,
  desiredState: 'ACTIVE' as const,
  status: 'PROVISIONING' as const,
  placementKind: 'SHARED' as const,
  deploymentId: 'shared-0',
  generation: 1,
  observedGeneration: 0,
  bronzeObjectPrefix: 'tnt_7f3a2c19d8e4/bronze/mqtt_events/',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
};

describe('CoreApiStreamingRepository', () => {
  it('registers an adapter without accepting broker credentials', async () => {
    const transport = new FakeTransport({
      adapter,
      credential: { username: adapter.adapterKey, password: 'issued-secret' },
    });
    const repository = new CoreApiStreamingRepository(transport);
    await repository.create({
      tenantStorageKey: adapter.tenantStorageKey,
      tenantDisplayName: adapter.tenantDisplayName,
      name: adapter.name,
      qos: 1,
      placementKind: 'SHARED',
    });

    expect(transport.requests[0]?.path).toBe('/streaming/mqtt-adapters');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toMatchObject({
      tenantStorageKey: 'tnt_7f3a2c19d8e4',
      tenantDisplayName: 'Factory 7',
      name: 'Line A',
      qos: 1,
    });
    expect(String(transport.requests[0]?.init?.body)).not.toContain('brokerUrl');
    expect(String(transport.requests[0]?.init?.body)).not.toContain('password');
  });

  it('encodes adapter identifiers for lifecycle commands', async () => {
    const transport = new FakeTransport(adapter);
    const repository = new CoreApiStreamingRepository(transport);
    await repository.pause('id/with space');
    await repository.resume('id/with space');
    await repository.rotateCredential('id/with space');
    await repository.archive('id/with space');

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/streaming/mqtt-adapters/id%2Fwith%20space/pause',
      '/streaming/mqtt-adapters/id%2Fwith%20space/resume',
      '/streaming/mqtt-adapters/id%2Fwith%20space/credentials',
      '/streaming/mqtt-adapters/id%2Fwith%20space',
    ]);
  });
});

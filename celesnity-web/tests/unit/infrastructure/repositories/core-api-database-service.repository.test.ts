import { describe, expect, it, vi } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiDatabaseServiceRepository } from '@/src/infrastructure/repositories/core-api-database-service.repository';

const id = '11111111-1111-4111-8111-111111111111';
const response = {
  id: '22222222-2222-4222-8222-222222222222',
  databaseServiceId: id,
  connectorType: 'POSTGRESQL',
  endpointSummary: 'db.direct.example.test:5432/postgres',
  setupMode: 'EXISTING',
  publicationName: 'celesnity_publication',
  slotName: 'celesnity_slot',
  verificationStatus: 'UNTESTED',
  revision: 0,
  createdAt: '2026-09-21T02:00:00.000Z',
  updatedAt: '2026-09-21T02:00:00.000Z',
  encryptedCredentialPayload: 'must-not-survive-mapping',
};

describe('CoreApiDatabaseServiceRepository CDC profile', () => {
  it('uses datasource-scoped get/save/validate/remove endpoints and maps only safe fields', async () => {
    const transport: GeneratedApiTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce({ ...response, verificationStatus: 'READY' })
        .mockResolvedValueOnce(undefined),
      stream: vi.fn(),
    };
    const repository = new CoreApiDatabaseServiceRepository(transport);

    const fetched = await repository.getCdcConnection(id);
    const saved = await repository.saveCdcConnection(id, {
      details: { connectionUrl: 'postgresql://cdc:canary@db/postgres' },
      setupMode: 'existing',
      publicationName: 'celesnity_publication',
      slotName: 'celesnity_slot',
    });
    const validated = await repository.validateCdcConnection(id);
    await repository.removeCdcConnection(id);

    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      `/database-services/${id}/cdc-connection`,
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      `/database-services/${id}/cdc-connection`,
      {
        method: 'PUT',
        body: JSON.stringify({
          details: { connectionUrl: 'postgresql://cdc:canary@db/postgres' },
          setupMode: 'EXISTING',
          publicationName: 'celesnity_publication',
          slotName: 'celesnity_slot',
        }),
      },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      3,
      `/database-services/${id}/cdc-connection/validate`,
      { method: 'POST' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      4,
      `/database-services/${id}/cdc-connection`,
      { method: 'DELETE' },
    );
    expect(JSON.stringify([fetched, saved, validated])).not.toContain('must-not-survive-mapping');
    expect(validated.verificationStatus).toBe('ready');
  });
});

describe('CoreApiDatabaseServiceRepository memberships', () => {
  it('lists available datasources and uses encoded idempotent membership routes', async () => {
    const transport: GeneratedApiTransport = {
      request: vi.fn().mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
      }),
      stream: vi.fn(),
    };
    const repository = new CoreApiDatabaseServiceRepository(transport);

    await repository.listAvailable({ databaseName: 'sales catalog', search: 'orders' });
    await repository.attach(id, 'sales catalog');
    await repository.detach(id, 'sales catalog');

    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      '/database-services/available?search=orders&databaseName=sales+catalog',
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      `/database-services/${id}/memberships/sales%20catalog`,
      { method: 'PUT' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      3,
      `/database-services/${id}/memberships/sales%20catalog`,
      { method: 'DELETE' },
    );
  });
});

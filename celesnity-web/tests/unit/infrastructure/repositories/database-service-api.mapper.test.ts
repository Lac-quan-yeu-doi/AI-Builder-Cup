import { describe, expect, it } from 'vitest';

import {
  fromDatabaseServiceResponse,
  toCreateDatabaseServiceRequest,
} from '@/src/infrastructure/repositories/database-service-api.mapper';

describe('database service API mapping', () => {
  it('keeps source database config separate from catalog memberships', () => {
    const service = fromDatabaseServiceResponse({
      id: 'source-1',
      name: 'Orders source',
      databaseNames: ['analytics', 'warehouse'],
      connectorType: 'POSTGRESQL',
      configSchemaVersion: 1,
      config: { databaseName: 'orders_source' },
      summary: [],
      verificationStatus: 'SUCCEEDED',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    });

    expect(service.databaseNames).toEqual(['analytics', 'warehouse']);
    expect(service.databaseName).toBe('analytics');
    expect(service.config.databaseName).toBe('orders_source');
  });

  it('writes the initial membership field instead of overloading source config', () => {
    expect(
      toCreateDatabaseServiceRequest({
        name: 'Orders source',
        initialDatabaseName: 'analytics',
        connectorType: 'POSTGRESQL',
        details: { databaseName: 'orders_source' },
      }),
    ).toEqual({
      name: 'Orders source',
      initialDatabaseName: 'analytics',
      connectorType: 'POSTGRESQL',
      details: { databaseName: 'orders_source' },
    });
  });
});

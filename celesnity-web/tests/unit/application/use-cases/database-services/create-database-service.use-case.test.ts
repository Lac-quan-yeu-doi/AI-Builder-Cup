import { describe, expect, it, vi } from 'vitest';

import { createCreateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/create-database-service.use-case';
import { normalizeDatabaseServiceInput } from '@/src/application/use-cases/database-services/normalize-database-service-input';

describe('normalizeDatabaseServiceInput', () => {
  it('carries the database the source is filed under', () => {
    // Legacy databaseName input is normalized to the explicit initial membership
    // contract before it crosses the repository boundary.
    expect(
      normalizeDatabaseServiceInput({
        name: '  Kasa Platform  ',
        databaseName: '  kasadev  ',
        connectorType: ' postgresql ',
        details: { host: '  postgres  ', port: 5432 },
      }),
    ).toEqual({
      name: 'Kasa Platform',
      initialDatabaseName: 'kasadev',
      connectorType: 'POSTGRESQL',
      details: { host: 'postgres', port: 5432 },
    });
  });

  it('leaves the field out when the source belongs to no database', () => {
    expect(
      normalizeDatabaseServiceInput({
        name: 'Factory ERP',
        connectorType: 'POSTGRESQL',
        details: {},
      }),
    ).toEqual({ name: 'Factory ERP', connectorType: 'POSTGRESQL', details: {} });
  });

  it('treats a blank database name as no database rather than an empty one', () => {
    expect(
      normalizeDatabaseServiceInput({
        name: 'Factory ERP',
        databaseName: '   ',
        connectorType: 'POSTGRESQL',
        details: {},
      }),
    ).toEqual({ name: 'Factory ERP', connectorType: 'POSTGRESQL', details: {} });
  });
});

describe('createCreateDatabaseServiceUseCase', () => {
  it('hands the repository the normalized input, database and all', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'svc-1' });
    const useCase = createCreateDatabaseServiceUseCase({
      create,
    } as unknown as Parameters<typeof createCreateDatabaseServiceUseCase>[0]);

    await useCase({
      name: 'Kasa Platform',
      initialDatabaseName: 'kasadev',
      connectorType: 'POSTGRESQL',
      details: {},
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kasa Platform', initialDatabaseName: 'kasadev' }),
    );
  });
});

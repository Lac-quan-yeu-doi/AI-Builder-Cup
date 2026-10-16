import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DatabaseService } from '@/src/entities/models/database-service';
import { createCreateDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/create-database-service.controller';

function service(overrides: Partial<DatabaseService> = {}): DatabaseService {
  return {
    id: 'service-1',
    name: 'Kasa Platform',
    databaseNames: ['kasadev'],
    databaseName: 'kasadev',
    connectorType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: { host: 'postgres' },
    summary: [],
    verification: { status: 'untested' },
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('createCreateDatabaseServiceController', () => {
  it('files the source under the database it was created in', async () => {
    // The schema used to declare name, connectorType and details only, and Zod
    // strips what it does not declare. So a source created from inside a
    // database arrived at Core filed under nothing, and the database's own
    // source list — which filters on this field — came back empty right after
    // the visitor had added one.
    const useCase = vi.fn().mockResolvedValue(service());
    const controller = createCreateDatabaseServiceController(useCase);

    const view = await controller({
      name: 'Kasa Platform',
      databaseName: 'kasadev',
      connectorType: 'POSTGRESQL',
      details: { host: 'postgres' },
    });

    expect(useCase).toHaveBeenCalledTimes(1);
    expect(useCase).toHaveBeenCalledWith({
      name: 'Kasa Platform',
      databaseName: 'kasadev',
      connectorType: 'POSTGRESQL',
      details: { host: 'postgres' },
    });
    expect(view.databaseName).toBe('kasadev');
  });

  it('leaves the database out when the source belongs to no database', async () => {
    const useCase = vi.fn().mockResolvedValue(service({ databaseName: undefined }));
    const controller = createCreateDatabaseServiceController(useCase);

    await controller({
      name: 'Kasa Platform',
      connectorType: 'POSTGRESQL',
      details: {},
    });

    expect(useCase).toHaveBeenCalledWith({
      name: 'Kasa Platform',
      connectorType: 'POSTGRESQL',
      details: {},
    });
  });

  it('rejects a blank name at the boundary', async () => {
    const useCase = vi.fn();
    const controller = createCreateDatabaseServiceController(useCase);

    await expect(
      controller({ name: '   ', connectorType: 'POSTGRESQL', details: {} }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCase).not.toHaveBeenCalled();
  });

  it('rejects a database name that is only whitespace', async () => {
    const useCase = vi.fn();
    const controller = createCreateDatabaseServiceController(useCase);

    await expect(
      controller({
        name: 'Kasa Platform',
        databaseName: '  ',
        connectorType: 'POSTGRESQL',
        details: {},
      }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCase).not.toHaveBeenCalled();
  });
});

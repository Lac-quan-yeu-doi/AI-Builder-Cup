import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import { createAttachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/attach-database-service.controller';
import { createDetachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/detach-database-service.controller';
import { createListAvailableDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-available-database-services.controller';

describe('database service membership controllers', () => {
  it('validates and forwards an available datasource query', async () => {
    const useCase = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    const controller = createListAvailableDatabaseServicesController(useCase);

    await controller({ databaseName: 'analytics', page: 1, pageSize: 50 });

    expect(useCase).toHaveBeenCalledWith({ databaseName: 'analytics', page: 1, pageSize: 50 });
  });

  it('attaches and detaches a validated membership', async () => {
    const attach = vi.fn();
    const detach = vi.fn();

    await createAttachDatabaseServiceController(attach)('source-1', 'analytics');
    await createDetachDatabaseServiceController(detach)('source-1', 'analytics');

    expect(attach).toHaveBeenCalledWith('source-1', 'analytics');
    expect(detach).toHaveBeenCalledWith('source-1', 'analytics');
  });

  it('rejects a blank membership database at the boundary', async () => {
    const attach = vi.fn();

    await expect(
      createAttachDatabaseServiceController(attach)('source-1', '  '),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(attach).not.toHaveBeenCalled();
  });

  it('rejects an available query without a catalog database', async () => {
    const list = vi.fn();

    await expect(
      createListAvailableDatabaseServicesController(list)({ databaseName: '  ' }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(list).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import { createCdcConnectionProfileController } from '@/src/interface-adapters/controllers/database-services/cdc-connection-profile.controller';

describe('createCdcConnectionProfileController', () => {
  it('normalizes safe setup input at the controller boundary', async () => {
    const useCases = {
      get: vi.fn(),
      save: vi.fn().mockResolvedValue({
        id: 'profile-1',
        databaseServiceId: 'source-1',
        connectorType: 'POSTGRESQL',
        endpointSummary: 'db:5432/postgres',
        setupMode: 'existing',
        verificationStatus: 'untested',
        revision: 0,
        createdAt: '2026-09-21T00:00:00.000Z',
        updatedAt: '2026-09-21T00:00:00.000Z',
      }),
      validate: vi.fn(),
      remove: vi.fn(),
    };
    const controller = createCdcConnectionProfileController(useCases);

    const view = await controller.save(' source-1 ', {
      details: { host: 'db' },
      setupMode: 'existing',
      publicationName: ' publication_1 ',
      slotName: ' slot_1 ',
    });

    expect(useCases.save).toHaveBeenCalledWith('source-1', {
      details: { host: 'db' },
      setupMode: 'existing',
      publicationName: 'publication_1',
      slotName: 'slot_1',
    });
    expect(view.endpointSummary).toBe('db:5432/postgres');
  });

  it('rejects malformed input before the use case is called', async () => {
    const useCases = { save: vi.fn() };
    const controller = createCdcConnectionProfileController(useCases as never);

    await expect(
      controller.save('source-1', { details: {}, setupMode: 'other' } as never),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.save).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createCdcConnectionProfileUseCases } from '@/src/application/use-cases/database-services/cdc-connection-profile.use-cases';

describe('createCdcConnectionProfileUseCases', () => {
  it('delegates every CDC profile operation through the repository port', async () => {
    const repository = {
      getCdcConnection: vi.fn().mockResolvedValue({ id: 'profile-1' }),
      saveCdcConnection: vi.fn().mockResolvedValue({ id: 'profile-1' }),
      validateCdcConnection: vi.fn().mockResolvedValue({ id: 'profile-1' }),
      removeCdcConnection: vi.fn().mockResolvedValue(undefined),
    };
    const useCases = createCdcConnectionProfileUseCases(repository as never);
    const input = { details: { host: 'db' }, setupMode: 'managed' as const };

    await useCases.get('source-1');
    await useCases.save('source-1', input);
    await useCases.validate('source-1');
    await useCases.remove('source-1');

    expect(repository.getCdcConnection).toHaveBeenCalledWith('source-1');
    expect(repository.saveCdcConnection).toHaveBeenCalledWith('source-1', input);
    expect(repository.validateCdcConnection).toHaveBeenCalledWith('source-1');
    expect(repository.removeCdcConnection).toHaveBeenCalledWith('source-1');
  });
});

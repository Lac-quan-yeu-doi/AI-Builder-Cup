import { describe, expect, it, vi } from 'vitest';

import { createMetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';

describe('MetadataCrawlerController', () => {
  it('rejects malformed IDs before calling the repository-backed use case', async () => {
    const useCases = {
      list: vi.fn(),
      get: vi.fn(),
      listAssignableDatabaseServices: vi.fn(),
      assign: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      runNow: vi.fn(),
      listRuns: vi.fn(),
      getRunLogs: vi.fn(),
    };
    const controller = createMetadataCrawlerController(useCases);

    await expect(controller.runNow('bad-id')).rejects.toThrow('Invalid metadata crawler id');
    expect(useCases.runNow).not.toHaveBeenCalled();
  });
});

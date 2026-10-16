import { describe, expect, it, vi } from 'vitest';

import { createDataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { DataWorkflowUseCases } from '@/src/application/use-cases/data-workflow/data-workflow.use-cases';

describe('DataWorkflowController', () => {
  it('lists the separate data workflow use case and presents a safe summary', async () => {
    const useCases: DataWorkflowUseCases = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'workflow-1',
            name: 'Daily ingest',
            revision: 1,
            paused: false,
            triggerKind: 'CALENDAR',
            createdAt: '2026-09-18T00:00:00.000Z',
            updatedAt: '2026-09-18T00:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        totalItems: 1,
      }),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      getSchedule: vi.fn(),
      setPaused: vi.fn(),
      listVersions: vi.fn(),
      listRuns: vi.fn(),
      startRun: vi.fn(),
      retryNode: vi.fn(),
      getWatchSourceCapabilities: vi.fn(),
      listWatchSourceCatalog: vi.fn(),
      listWatchSourceRelations: vi.fn(),
      validateWatchSource: vi.fn(),
      listPipelineTargets: vi.fn(),
    };

    const controller = createDataWorkflowController(useCases);

    await expect(controller.list()).resolves.toEqual({
      items: [expect.objectContaining({ triggerKind: 'CALENDAR' })],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    });
    expect(useCases.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });
});

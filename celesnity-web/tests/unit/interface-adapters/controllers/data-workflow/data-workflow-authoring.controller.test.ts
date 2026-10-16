import { describe, expect, it, vi } from 'vitest';

import { createDataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import { createManualWorkflowDraft } from '@/src/entities/models/data-workflow-graph';
import type { DataWorkflowUseCases } from '@/src/application/use-cases/data-workflow/data-workflow.use-cases';

describe('DataWorkflowController authoring', () => {
  it('delegates create, draft save, schedule preview and immutable publication', async () => {
    const draft = createManualWorkflowDraft('Daily ingest');
    const workflow = {
      id: 'workflow-1',
      ...draft,
      revision: 1,
      paused: false,
      publishedVersion: undefined,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const useCases = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue(workflow),
      get: vi.fn().mockResolvedValue(workflow),
      update: vi.fn().mockResolvedValue({ ...workflow, revision: 2 }),
      publish: vi.fn().mockResolvedValue({
        id: 'workflow-version-1',
        versionNumber: 1,
        graph: {},
        trigger: {},
        publishedAt: '2026-09-18T00:00:00.000Z',
      }),
      previewSchedule: vi.fn().mockResolvedValue({
        source: 'DRAFT',
        kind: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON'],
        timezone: 'Asia/Ho_Chi_Minh',
        occurrences: ['2026-09-21T00:00:00.000Z'],
      }),
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
    } satisfies DataWorkflowUseCases;
    const controller = createDataWorkflowController(useCases);

    await expect(controller.create({ draft })).resolves.toMatchObject({ id: 'workflow-1' });
    await expect(
      controller.save({ id: 'workflow-1', expectedRevision: 1, draft }),
    ).resolves.toMatchObject({
      revision: 2,
    });
    await expect(
      controller.publish({ id: 'workflow-1', expectedRevision: 2 }),
    ).resolves.toMatchObject({
      versionNumber: 1,
    });
    await expect(controller.previewSchedule('workflow-1', 'DRAFT', 1)).resolves.toMatchObject({
      kind: 'CALENDAR',
    });
  });
});

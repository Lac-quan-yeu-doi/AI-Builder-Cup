import { describe, expect, it, vi } from 'vitest';

import { createAutomationWorkflowUseCases } from '@/src/application/use-cases/automation-workflow/automation-workflow.use-cases';
import type { AutomationWorkflowRepository } from '@/src/application/repositories/automation-workflow.repository.interface';
import type { AutomationWorkflow } from '@/src/entities/models/automation-workflow';

function makeRepository(
  overrides: Partial<AutomationWorkflowRepository> = {},
): AutomationWorkflowRepository {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    addStep: vi.fn(),
    removeStep: vi.fn(),
    updateStep: vi.fn(),
    testFire: vi.fn(),
    getRunStatus: vi.fn(),
    listRuns: vi.fn(),
    retryRun: vi.fn(),
    ...overrides,
  };
}

describe('AutomationWorkflow use cases', () => {
  it('delegates create to the repository and returns its result', async () => {
    const workflow: AutomationWorkflow = {
      id: 'wf-1',
      name: 'Ingest to Slack',
      status: 'draft',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
      createdAt: '2026-09-05T00:00:00.000Z',
      triggerFields: [],
      steps: [],
    };
    const repository = makeRepository({ create: vi.fn(async () => workflow) });
    const useCases = createAutomationWorkflowUseCases(repository);

    await expect(
      useCases.create({
        name: 'Ingest to Slack',
        triggerType: 'EVENT',
        eventTopic: 'celesnity.ingest.file.created.v1',
      }),
    ).resolves.toEqual(workflow);
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('delegates retryRun with the run id, workflow id, and resume step in order', async () => {
    const repository = makeRepository();
    const useCases = createAutomationWorkflowUseCases(repository);

    await useCases.retryRun('wf-1', 'run-1', 2);
    expect(repository.retryRun).toHaveBeenCalledWith('wf-1', 'run-1', 2);
  });

  it('delegates listRuns to the repository and returns its result', async () => {
    const repository = makeRepository({ listRuns: vi.fn(async () => []) });
    const useCases = createAutomationWorkflowUseCases(repository);

    await expect(useCases.listRuns('wf-1')).resolves.toEqual([]);
    expect(repository.listRuns).toHaveBeenCalledWith('wf-1');
  });
});

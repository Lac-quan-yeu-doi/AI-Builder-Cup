import { describe, expect, it, vi } from 'vitest';

import { createAutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { AutomationWorkflowUseCases } from '@/src/application/use-cases/automation-workflow/automation-workflow.use-cases';
import type {
  AutomationWorkflow,
  AutomationWorkflowRun,
  AutomationWorkflowRunSummary,
} from '@/src/entities/models/automation-workflow';

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

function makeUseCases(
  overrides: Partial<AutomationWorkflowUseCases> = {},
): AutomationWorkflowUseCases {
  return {
    list: vi.fn(async () => [workflow]),
    get: vi.fn(async () => workflow),
    create: vi.fn(async () => workflow),
    update: vi.fn(async () => workflow),
    duplicate: vi.fn(async () => workflow),
    remove: vi.fn(async () => undefined),
    addStep: vi.fn(async () => ({
      id: 'step-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    })),
    removeStep: vi.fn(async () => undefined),
    updateStep: vi.fn(async () => ({
      id: 'step-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    })),
    testFire: vi.fn(async () => ({ runId: 'run-1' })),
    getRunStatus: vi.fn(
      async () =>
        ({
          runId: 'run-1',
          status: 'success',
          triggeredBy: 'test',
          startedAt: '2026-09-05T00:00:00.000Z',
          steps: [],
        }) as AutomationWorkflowRun,
    ),
    listRuns: vi.fn(async () => []),
    retryRun: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('AutomationWorkflowController', () => {
  it('lists workflows through one use-case call and presents copied items', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    const result = await controller.list();

    expect(useCases.list).toHaveBeenCalledOnce();
    expect(result).toEqual([workflow]);
  });

  it('creates a workflow when input is valid', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    const result = await controller.create({
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 't',
    });

    expect(useCases.create).toHaveBeenCalledWith({
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 't',
    });
    expect(result).toEqual(workflow);
  });

  it('rejects an invalid create input before calling the use case', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(controller.create({ name: 'x' } as never)).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.create).not.toHaveBeenCalled();
  });

  it('accepts declared triggerFields on create', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.create({
      name: 'x',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });
    expect(useCases.create).toHaveBeenCalledWith({
      name: 'x',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });
  });

  it('rejects a create input whose triggerField has an unknown type', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(
      controller.create({
        name: 'x',
        triggerType: 'EVENT',
        triggerFields: [{ name: 'bad', type: 'json' }],
      } as never),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.create).not.toHaveBeenCalled();
  });

  it('accepts declared triggerFields on update', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.update('wf-1', {
      triggerFields: [{ name: 'amount', type: 'number', required: false }],
    });
    expect(useCases.update).toHaveBeenCalledWith('wf-1', {
      triggerFields: [{ name: 'amount', type: 'number', required: false }],
    });
  });

  it('updates a workflow (rename and/or enable) through one use-case call', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.update('wf-1', { enabled: true });
    expect(useCases.update).toHaveBeenCalledWith('wf-1', { enabled: true });
  });

  it('duplicates a workflow', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.duplicate('wf-1');
    expect(useCases.duplicate).toHaveBeenCalledWith('wf-1');
  });

  it('removes a workflow without invoking a presenter', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(controller.remove('wf-1')).resolves.toBeUndefined();
    expect(useCases.remove).toHaveBeenCalledWith('wf-1');
  });

  it('adds a step when input is valid', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.addStep('wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    expect(useCases.addStep).toHaveBeenCalledWith('wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
  });

  it('accepts a systemPrompt override on add-step', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.addStep('wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a schema extractor.',
    });
    expect(useCases.addStep).toHaveBeenCalledWith('wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a schema extractor.',
    });
  });

  it('rejects an invalid add-step input before calling the use case', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(
      controller.addStep('wf-1', { agentId: 'x', inputTemplate: { n: 1 } } as never),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.addStep).not.toHaveBeenCalled();
  });

  it('removes a step', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.removeStep('wf-1', 'step-1');
    expect(useCases.removeStep).toHaveBeenCalledWith('wf-1', 'step-1');
  });

  it('updates a step when input is valid', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.updateStep('wf-1', 'step-1', { agentId: 'summarizer' });
    expect(useCases.updateStep).toHaveBeenCalledWith('wf-1', 'step-1', { agentId: 'summarizer' });
  });

  it('accepts a systemPrompt override on update-step', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.updateStep('wf-1', 'step-1', { systemPrompt: 'You are terse.' });
    expect(useCases.updateStep).toHaveBeenCalledWith('wf-1', 'step-1', {
      systemPrompt: 'You are terse.',
    });
  });

  it('rejects an invalid update-step input before calling the use case', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(
      controller.updateStep('wf-1', 'step-1', { inputTemplate: { n: 1 } } as never),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.updateStep).not.toHaveBeenCalled();
  });

  it('test-fires a workflow when input is valid', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    const result = await controller.testFire('wf-1', { payload: { bucket: 'x' } });
    expect(useCases.testFire).toHaveBeenCalledWith('wf-1', { payload: { bucket: 'x' } });
    expect(result).toEqual({ runId: 'run-1' });
  });

  it('rejects an invalid test-fire input before calling the use case', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(
      controller.testFire('wf-1', { forceFailAtStep: 0 } as never),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.testFire).not.toHaveBeenCalled();
  });

  it('reports run status', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    const result = await controller.getRunStatus('wf-1', 'run-1');
    expect(useCases.getRunStatus).toHaveBeenCalledWith('wf-1', 'run-1');
    expect(result.runId).toBe('run-1');
  });

  it('lists runs, presented, newest first', async () => {
    const useCases = makeUseCases({
      listRuns: vi.fn(
        async () =>
          [
            {
              runId: 'run-2',
              status: 'running',
              triggeredBy: 'test',
              startedAt: '2026-09-06T07:00:00.000Z',
            },
          ] as AutomationWorkflowRunSummary[],
      ),
    });
    const controller = createAutomationWorkflowController(useCases);

    const result = await controller.listRuns('wf-1');
    expect(useCases.listRuns).toHaveBeenCalledWith('wf-1');
    expect(result[0]?.runId).toBe('run-2');
  });

  it('lists an empty array when the workflow has never run', async () => {
    const useCases = makeUseCases({ listRuns: vi.fn(async () => []) });
    const controller = createAutomationWorkflowController(useCases);

    expect(await controller.listRuns('wf-1')).toEqual([]);
  });

  it('retries a run when the resume step is valid', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await controller.retryRun('wf-1', 'run-1', { resumeFromStep: 2 });
    expect(useCases.retryRun).toHaveBeenCalledWith('wf-1', 'run-1', 2);
  });

  it('rejects an invalid retry input before calling the use case', async () => {
    const useCases = makeUseCases();
    const controller = createAutomationWorkflowController(useCases);

    await expect(
      controller.retryRun('wf-1', 'run-1', { resumeFromStep: 0 }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(useCases.retryRun).not.toHaveBeenCalled();
  });
});

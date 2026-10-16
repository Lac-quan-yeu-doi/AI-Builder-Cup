import { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';

function makeUseCases() {
  const workflow = AutomationWorkflow.create({
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Chain',
    status: 'enabled',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.ingest.file.created.v1',
    createdBy: 'org-1',
    createdAt: new Date(),
  });
  const copy = AutomationWorkflow.create({
    ...workflow,
    id: 'wf-2',
    name: 'Chain (copy)',
    status: 'draft',
  });
  const originalSteps = [
    AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    }),
  ];
  const workflows = {
    create: jest.fn().mockResolvedValue(copy),
    listForOrganization: jest.fn(),
    findById: jest.fn().mockResolvedValue(workflow),
    setStatus: jest.fn(),
    rename: jest.fn(),
    updateTrigger: jest.fn(),
    delete: jest.fn(),
    findEnabledByTopic: jest.fn().mockResolvedValue([workflow]),
    scheduleDue: jest.fn(),
    advanceNextRun: jest.fn(),
    listStepsForWorkflow: jest.fn().mockResolvedValue(originalSteps),
    addStep: jest.fn(),
    removeStep: jest.fn(),
    updateStep: jest.fn(),
  };
  const run = AutomationWorkflowRun.create({
    id: 'run-1',
    workflowId: 'wf-1',
    triggeredBy: 'event',
    status: 'running',
    triggerPayload: { bucket: 'x' },
    startedAt: new Date(),
  });
  const runs = {
    createRun: jest.fn(),
    findRunById: jest.fn().mockResolvedValue(run),
    listRunsForWorkflow: jest.fn().mockResolvedValue([run]),
    updateRunStatus: jest.fn(),
    createStepRun: jest.fn(),
    updateStepRun: jest.fn(),
    listStepRunsForRun: jest.fn(),
  };
  const dispatcher = { start: jest.fn().mockResolvedValue(run), retryFrom: jest.fn() };

  const webhookClient = { trigger: jest.fn(), listAgents: jest.fn() };

  const scheduleNext = new Date('2026-09-08T08:00:00.000Z');
  const schedule = { next: jest.fn().mockReturnValue(scheduleNext) };

  const useCases = new AutomationWorkflowUseCases(
    workflows,
    runs,
    dispatcher as never,
    webhookClient,
    schedule,
  );
  return {
    useCases,
    workflows,
    runs,
    dispatcher,
    webhookClient,
    schedule,
    scheduleNext,
    workflow,
    run,
    copy,
    originalSteps,
  };
}

describe('AutomationWorkflowUseCases', () => {
  it('dispatchWorkflowsForEvent starts a run for every enabled workflow matching the topic', async () => {
    const { useCases, workflows, dispatcher } = makeUseCases();
    await useCases.dispatchWorkflowsForEvent('org-1', 'celesnity.ingest.file.created.v1', {
      bucket: 'x',
    });

    expect(workflows.findEnabledByTopic).toHaveBeenCalledWith(
      'org-1',
      'celesnity.ingest.file.created.v1',
    );
    expect(dispatcher.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-1' }),
      { bucket: 'x' },
      'event',
      {},
    );
  });

  it('testFireWorkflow dispatches with triggeredBy "test" and forwards forceFailAtStep', async () => {
    const { useCases, dispatcher, workflow } = makeUseCases();
    await useCases.testFireWorkflow('wf-1', { bucket: 'x' }, 2);

    expect(dispatcher.start).toHaveBeenCalledWith(workflow, { bucket: 'x' }, 'test', {
      forceFailAtStep: 2,
    });
  });

  it('testFireWorkflow throws when the workflow does not exist', async () => {
    const { useCases, workflows } = makeUseCases();
    workflows.findById.mockResolvedValueOnce(undefined);
    await expect(useCases.testFireWorkflow('missing', {})).rejects.toThrow('missing');
  });

  it('retryWorkflowRun looks up the existing run and workflow, then resumes from the given step', async () => {
    const { useCases, workflows, dispatcher, workflow, run } = makeUseCases();
    await useCases.retryWorkflowRun('run-1', 'wf-1', 2);

    expect(workflows.findById).toHaveBeenCalledWith('wf-1');
    expect(dispatcher.retryFrom).toHaveBeenCalledWith(run, workflow, 2);
  });

  it('retryWorkflowRun throws when the run does not exist', async () => {
    const { useCases, runs } = makeUseCases();
    runs.findRunById.mockResolvedValueOnce(undefined);
    await expect(useCases.retryWorkflowRun('missing-run', 'wf-1', 1)).rejects.toThrow(
      'missing-run',
    );
  });

  it('does not retry a run under a different workflow', async () => {
    const { useCases, workflows, copy, dispatcher } = makeUseCases();
    workflows.findById.mockResolvedValueOnce(copy);
    await expect(useCases.retryWorkflowRun('run-1', copy.id, 1))
      .rejects.toThrow('does not belong');
    expect(dispatcher.retryFrom).not.toHaveBeenCalled();
  });

  it('duplicateWorkflow copies the trigger and every step into a new draft workflow', async () => {
    const { useCases, workflows, copy, originalSteps } = makeUseCases();
    const result = await useCases.duplicateWorkflow('wf-1', 'user-1');

    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chain (copy)',
        triggerType: 'EVENT',
        eventTopic: 'celesnity.ingest.file.created.v1',
        createdBy: 'user-1',
      }),
    );
    expect(workflows.addStep).toHaveBeenCalledWith(
      'wf-2',
      originalSteps[0]!.agentId,
      originalSteps[0]!.inputTemplate,
      originalSteps[0]!.systemPrompt,
    );
    expect(result).toBe(copy);
  });

  it('duplicateWorkflow throws when the source workflow does not exist', async () => {
    const { useCases, workflows } = makeUseCases();
    workflows.findById.mockResolvedValueOnce(undefined);
    await expect(useCases.duplicateWorkflow('missing', 'user-1')).rejects.toThrow('missing');
  });

  it('getWorkflow returns the workflow with its steps', async () => {
    const { useCases, workflow, originalSteps } = makeUseCases();
    const result = await useCases.getWorkflow('wf-1');
    expect(result?.workflow).toBe(workflow);
    expect(result?.steps).toBe(originalSteps);
  });

  it('getWorkflow returns undefined when the workflow does not exist', async () => {
    const { useCases, workflows } = makeUseCases();
    workflows.findById.mockResolvedValueOnce(undefined);
    expect(await useCases.getWorkflow('missing')).toBeUndefined();
  });

  it('getRunStatus returns the run with its step runs', async () => {
    const { useCases, runs, run } = makeUseCases();
    const stepRuns: never[] = [];
    runs.listStepRunsForRun.mockResolvedValueOnce(stepRuns);

    const result = await useCases.getRunStatus('run-1');
    expect(result?.run).toBe(run);
    expect(result?.stepRuns).toBe(stepRuns);
  });

  it('getRunStatus returns undefined when the run does not exist', async () => {
    const { useCases, runs } = makeUseCases();
    runs.findRunById.mockResolvedValueOnce(undefined);
    expect(await useCases.getRunStatus('missing')).toBeUndefined();
  });

  it('listRuns delegates to the repository, newest-first', async () => {
    const { useCases, runs, run } = makeUseCases();
    runs.listRunsForWorkflow.mockResolvedValueOnce([run]);

    const result = await useCases.listRuns('wf-1', 5);

    expect(runs.listRunsForWorkflow).toHaveBeenCalledWith('wf-1', 5);
    expect(result).toEqual([run]);
  });

  it('listAvailableAgents excludes automation-workflow-editor and chart-encoding-inference', async () => {
    const { useCases, webhookClient } = makeUseCases();
    webhookClient.listAgents.mockResolvedValue([
      { name: 'automation-workflow-editor' },
      { name: 'chart-encoding-inference' },
      { name: 'chat-assistant', systemPrompt: 'You are Minder...' },
    ]);

    const result = await useCases.listAvailableAgents();

    expect(result).toEqual([{ name: 'chat-assistant', systemPrompt: 'You are Minder...' }]);
  });

  it('setEnabled(true) on a SCHEDULE workflow computes and stores nextRunAt', async () => {
    const { useCases, workflows, schedule, scheduleNext } = makeUseCases();
    const scheduleWorkflow = AutomationWorkflow.create({
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Daily digest',
      status: 'draft',
      triggerType: 'SCHEDULE',
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'UTC',
      createdBy: 'org-1',
      createdAt: new Date(),
    });
    workflows.findById.mockResolvedValue(scheduleWorkflow);
    workflows.setStatus.mockResolvedValue({ ...scheduleWorkflow, status: 'enabled' });

    await useCases.setEnabled('wf-1', true);

    expect(workflows.setStatus).toHaveBeenCalledWith('wf-1', 'enabled');
    expect(schedule.next).toHaveBeenCalledWith('0 8 * * *', 'UTC', expect.any(Date));
    expect(workflows.advanceNextRun).toHaveBeenCalledWith('wf-1', scheduleNext);
  });

  it('setEnabled(false) on a SCHEDULE workflow clears nextRunAt', async () => {
    const { useCases, workflows, schedule } = makeUseCases();
    const scheduleWorkflow = AutomationWorkflow.create({
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Daily digest',
      status: 'enabled',
      triggerType: 'SCHEDULE',
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'UTC',
      createdBy: 'org-1',
      createdAt: new Date(),
    });
    workflows.findById.mockResolvedValue(scheduleWorkflow);
    workflows.setStatus.mockResolvedValue({ ...scheduleWorkflow, status: 'draft' });

    await useCases.setEnabled('wf-1', false);

    expect(schedule.next).not.toHaveBeenCalled();
    expect(workflows.advanceNextRun).toHaveBeenCalledWith('wf-1', null);
  });

  it('setEnabled(true) on an EVENT workflow does not compute a schedule', async () => {
    const { useCases, workflows, schedule } = makeUseCases();
    workflows.setStatus.mockResolvedValue({});

    await useCases.setEnabled('wf-1', true);

    expect(schedule.next).not.toHaveBeenCalled();
    expect(workflows.advanceNextRun).not.toHaveBeenCalled();
  });

  it('dispatchScheduledWorkflow starts a schedule run and advances nextRunAt', async () => {
    const { useCases, dispatcher, workflows, schedule, scheduleNext } = makeUseCases();
    const now = new Date('2026-09-07T08:00:00.000Z');
    const scheduleWorkflow = AutomationWorkflow.create({
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Daily digest',
      status: 'enabled',
      triggerType: 'SCHEDULE',
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'UTC',
      createdBy: 'org-1',
      createdAt: new Date(),
    });

    await useCases.dispatchScheduledWorkflow(scheduleWorkflow, now);

    expect(dispatcher.start).toHaveBeenCalledWith(
      scheduleWorkflow,
      { firedAt: now.toISOString() },
      'schedule',
      {},
    );
    expect(schedule.next).toHaveBeenCalledWith('0 8 * * *', 'UTC', now);
    expect(workflows.advanceNextRun).toHaveBeenCalledWith('wf-1', scheduleNext);
  });

  it('claimDueSchedules delegates to the repository scheduleDue', async () => {
    const { useCases, workflows } = makeUseCases();
    const now = new Date('2026-09-07T08:00:00.000Z');
    workflows.scheduleDue.mockResolvedValueOnce([]);

    await useCases.claimDueSchedules(25, now);

    expect(workflows.scheduleDue).toHaveBeenCalledWith(25, now);
  });

  it('createWorkflow validates and normalizes triggerFields before persisting', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.createWorkflow({
      organizationId: 'org-1',
      name: 'Chain',
      triggerType: 'EVENT',
      createdBy: 'user-1',
      triggerFields: [{ name: 'run_date', type: 'date' }] as never,
    });

    expect(workflows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerFields: [{ name: 'run_date', type: 'date', required: true }],
      }),
    );
  });

  it('createWorkflow defaults triggerFields to [] when omitted', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.createWorkflow({
      organizationId: 'org-1',
      name: 'Chain',
      triggerType: 'EVENT',
      createdBy: 'user-1',
    });

    expect(workflows.create).toHaveBeenCalledWith(expect.objectContaining({ triggerFields: [] }));
  });

  it('createWorkflow rejects an unknown trigger field type', async () => {
    const { useCases } = makeUseCases();
    await expect(
      useCases.createWorkflow({
        organizationId: 'org-1',
        name: 'Chain',
        triggerType: 'EVENT',
        createdBy: 'user-1',
        triggerFields: [{ name: 'x', type: 'json' }] as never,
      }),
    ).rejects.toThrow(/type/i);
  });

  it('updateTrigger validates triggerFields when provided', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.updateTrigger('wf-1', {
      triggerFields: [{ name: 'run_date', type: 'date' }] as never,
    });

    expect(workflows.updateTrigger).toHaveBeenCalledWith('wf-1', {
      triggerFields: [{ name: 'run_date', type: 'date', required: true }],
    });
  });

  it('updateTrigger leaves triggerFields untouched when the patch omits them', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.updateTrigger('wf-1', { triggerType: 'SCHEDULE' });

    expect(workflows.updateTrigger).toHaveBeenCalledWith('wf-1', { triggerType: 'SCHEDULE' });
  });

  it('addStep threads an optional systemPrompt through to the repository', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.addStep(
      'wf-1',
      'schema-extractor',
      { message: '$.trigger.bucket' },
      'You are a terse schema critic.',
    );

    expect(workflows.addStep).toHaveBeenCalledWith(
      'wf-1',
      'schema-extractor',
      { message: '$.trigger.bucket' },
      'You are a terse schema critic.',
    );
  });

  it('addStep passes systemPrompt as undefined when omitted', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.addStep('wf-1', 'schema-extractor', { message: '$.trigger.bucket' });

    expect(workflows.addStep).toHaveBeenCalledWith(
      'wf-1',
      'schema-extractor',
      { message: '$.trigger.bucket' },
      undefined,
    );
  });

  it('updateStep threads systemPrompt through to the repository patch', async () => {
    const { useCases, workflows } = makeUseCases();
    await useCases.updateStep('step-1', { systemPrompt: 'You are a blunt editor.' });

    expect(workflows.updateStep).toHaveBeenCalledWith('step-1', {
      systemPrompt: 'You are a blunt editor.',
    });
  });
});

import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';
import { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';

describe('AutomationWorkflow', () => {
  const baseProps = {
    id: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    name: 'Ingest to Slack',
    status: 'draft' as const,
    triggerType: 'EVENT' as const,
    eventTopic: 'celesnity.ingest.file.created.v1',
    createdBy: '33333333-3333-3333-3333-333333333333',
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
  };

  it('creates a frozen instance carrying every field', () => {
    const workflow = AutomationWorkflow.create(baseProps);
    expect(workflow).toEqual({ ...baseProps, triggerFields: [] });
    expect(Object.isFrozen(workflow)).toBe(true);
  });

  it('withStatus returns a new frozen instance with only status changed', () => {
    const workflow = AutomationWorkflow.create(baseProps);
    const enabled = workflow.withStatus('enabled');
    expect(enabled.status).toBe('enabled');
    expect(enabled.id).toBe(workflow.id);
    expect(workflow.status).toBe('draft');
  });

  it('defaults triggerFields to an empty array when omitted', () => {
    const workflow = AutomationWorkflow.create(baseProps);
    expect(workflow.triggerFields).toEqual([]);
  });

  it('carries declared trigger fields through create()', () => {
    const workflow = AutomationWorkflow.create({
      ...baseProps,
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });
    expect(workflow.triggerFields).toEqual([
      { name: 'run_date', type: 'date', label: 'Run date', required: true },
    ]);
  });
});

describe('AutomationWorkflowStep', () => {
  it('creates a frozen instance carrying every field', () => {
    const props = {
      id: '44444444-4444-4444-4444-444444444444',
      workflowId: '11111111-1111-1111-1111-111111111111',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    };
    const step = AutomationWorkflowStep.create(props);
    expect(step).toEqual(props);
    expect(Object.isFrozen(step)).toBe(true);
  });

  it('carries an optional systemPrompt override through create()', () => {
    const step = AutomationWorkflowStep.create({
      id: '44444444-4444-4444-4444-444444444444',
      workflowId: '11111111-1111-1111-1111-111111111111',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a terse schema critic.',
    });
    expect(step.systemPrompt).toBe('You are a terse schema critic.');
  });

  it('leaves systemPrompt undefined when omitted', () => {
    const step = AutomationWorkflowStep.create({
      id: '44444444-4444-4444-4444-444444444444',
      workflowId: '11111111-1111-1111-1111-111111111111',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    expect(step.systemPrompt).toBeUndefined();
  });
});

describe('AutomationWorkflowRun', () => {
  const baseProps = {
    id: '55555555-5555-5555-5555-555555555555',
    workflowId: '11111111-1111-1111-1111-111111111111',
    triggeredBy: 'event' as const,
    status: 'running' as const,
    triggerPayload: { bucket: 'ingest-bucket' },
    startedAt: new Date('2026-09-05T00:00:00.000Z'),
  };

  it('creates a frozen instance carrying every field', () => {
    const run = AutomationWorkflowRun.create(baseProps);
    expect(run).toEqual(baseProps);
    expect(Object.isFrozen(run)).toBe(true);
  });

  it('withStatus sets status and finishedAt together', () => {
    const run = AutomationWorkflowRun.create(baseProps);
    const finishedAt = new Date('2026-09-05T00:05:00.000Z');
    const finished = run.withStatus('success', finishedAt);
    expect(finished.status).toBe('success');
    expect(finished.finishedAt).toBe(finishedAt);
    expect(run.status).toBe('running');
  });
});

describe('AutomationWorkflowStepRun', () => {
  const baseProps = {
    id: '66666666-6666-6666-6666-666666666666',
    runId: '55555555-5555-5555-5555-555555555555',
    stepId: '44444444-4444-4444-4444-444444444444',
    status: 'queued' as const,
  };

  it('creates a frozen instance carrying every field', () => {
    const stepRun = AutomationWorkflowStepRun.create(baseProps);
    expect(stepRun).toEqual(baseProps);
    expect(Object.isFrozen(stepRun)).toBe(true);
  });

  it('withStatus patches status plus whichever fields are supplied', () => {
    const stepRun = AutomationWorkflowStepRun.create(baseProps);
    const started = stepRun.withStatus('running', {
      agentRunId: 'run-1',
      startedAt: new Date('2026-09-05T00:00:01.000Z'),
    });
    expect(started.status).toBe('running');
    expect(started.agentRunId).toBe('run-1');

    const finished = started.withStatus('success', {
      output: 'done',
      finishedAt: new Date('2026-09-05T00:00:05.000Z'),
    });
    expect(finished.status).toBe('success');
    expect(finished.agentRunId).toBe('run-1'); // carried forward, not supplied again
    expect(finished.output).toEqual('done');
  });
});

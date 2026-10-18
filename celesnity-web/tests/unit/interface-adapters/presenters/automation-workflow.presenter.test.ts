import { describe, expect, it } from 'vitest';

import {
  presentAutomationWorkflow,
  presentAutomationWorkflowRun,
  presentAutomationWorkflowRunSummaries,
  presentAutomationWorkflows,
} from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import type {
  AutomationWorkflow,
  AutomationWorkflowRun,
  AutomationWorkflowRunSummary,
} from '@/src/entities/models/automation-workflow';

const workflow: AutomationWorkflow = {
  id: 'wf-1',
  name: 'Ingest to Slack',
  status: 'enabled',
  triggerType: 'EVENT',
  eventTopic: 'celesnity.ingest.file.created.v1',
  createdAt: '2026-09-05T00:00:00.000Z',
  triggerFields: [{ name: 'bucket', type: 'text', required: true }],
  steps: [
    {
      id: 'step-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    },
  ],
};

describe('presentAutomationWorkflow', () => {
  it('maps every field, including nested steps', () => {
    const view = presentAutomationWorkflow(workflow);
    expect(view).toEqual(workflow);
  });

  it('maps declared trigger fields through to the view model', () => {
    const view = presentAutomationWorkflow(workflow);
    expect(view.triggerFields).toEqual([{ name: 'bucket', type: 'text', required: true }]);
  });

  it('omits optional trigger fields entirely when absent, rather than setting them to undefined', () => {
    const scheduled: AutomationWorkflow = {
      ...workflow,
      eventTopic: undefined,
      triggerType: 'SCHEDULE',
      scheduleCron: '0 9 * * *',
      scheduleTimezone: 'UTC',
    };
    const view = presentAutomationWorkflow(scheduled);
    expect('eventTopic' in view).toBe(false);
    expect(view.scheduleCron).toBe('0 9 * * *');
  });

  it('returns a deep copy — mutating the source steps array does not affect the ViewModel', () => {
    const source = { ...workflow, steps: [...workflow.steps] };
    const view = presentAutomationWorkflow(source);
    (source.steps as { id: string }[]).push({ id: 'intruder' } as never);
    expect(view.steps).toHaveLength(1);
  });

  it('maps a step systemPrompt override through to the view model when present', () => {
    const withPrompt: AutomationWorkflow = {
      ...workflow,
      steps: [{ ...workflow.steps[0]!, systemPrompt: 'You are a schema extractor.' }],
    };
    const view = presentAutomationWorkflow(withPrompt);
    expect(view.steps[0]?.systemPrompt).toBe('You are a schema extractor.');
  });

  it('omits systemPrompt on a step entirely when absent', () => {
    const view = presentAutomationWorkflow(workflow);
    expect('systemPrompt' in view.steps[0]!).toBe(false);
  });
});

describe('presentAutomationWorkflows', () => {
  it('maps a list of workflows', () => {
    expect(presentAutomationWorkflows([workflow])).toEqual([workflow]);
  });
});

describe('presentAutomationWorkflowRun', () => {
  it('maps run status with per-step output and debug fields', () => {
    const run: AutomationWorkflowRun = {
      runId: 'run-1',
      status: 'failed',
      triggeredBy: 'test',
      startedAt: '2026-09-06T07:00:00.000Z',
      finishedAt: '2026-09-06T07:01:00.000Z',
      steps: [
        {
          stepId: 'step-1',
          status: 'success',
          output: 'schema: 12 columns',
          agentRunId: 'agent-run-1',
          startedAt: '2026-09-06T07:00:01.000Z',
          finishedAt: '2026-09-06T07:00:30.000Z',
        },
        { stepId: 'step-2', status: 'failed' },
      ],
    };
    expect(presentAutomationWorkflowRun(run)).toEqual(run);
  });
});

describe('presentAutomationWorkflowRunSummaries', () => {
  it('maps a list of run summaries, newest first', () => {
    const runs: AutomationWorkflowRunSummary[] = [
      {
        runId: 'run-2',
        status: 'running',
        triggeredBy: 'schedule',
        startedAt: '2026-09-06T07:00:00.000Z',
      },
      {
        runId: 'run-1',
        status: 'success',
        triggeredBy: 'test',
        startedAt: '2026-09-05T07:00:00.000Z',
        finishedAt: '2026-09-05T07:01:00.000Z',
      },
    ];
    expect(presentAutomationWorkflowRunSummaries(runs)).toEqual(runs);
  });
});

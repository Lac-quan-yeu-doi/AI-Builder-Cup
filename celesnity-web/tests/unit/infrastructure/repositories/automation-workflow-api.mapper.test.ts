import { describe, expect, it } from 'vitest';

import {
  fromWorkflowResponse,
  fromWorkflowRunResponse,
  fromWorkflowRunSummaryResponse,
  fromWorkflowStepResponse,
  toAddWorkflowStepRequest,
  toCreateWorkflowRequest,
  toRetryWorkflowRunRequest,
  toTestFireWorkflowRequest,
  toUpdateWorkflowRequest,
  toUpdateWorkflowStepRequest,
} from '@/src/infrastructure/repositories/automation-workflow-api.mapper';

describe('automation-workflow-api mapper', () => {
  it('maps a workflow response into the domain entity, including nested steps', () => {
    const dto = {
      id: 'wf-1',
      name: 'Ingest to Slack',
      status: 'enabled' as const,
      triggerType: 'EVENT' as const,
      eventTopic: 'celesnity.ingest.file.created.v1',
      createdAt: '2026-09-05T00:00:00.000Z',
      triggerFields: [{ name: 'bucket', type: 'text' as const, required: true }],
      steps: [
        {
          id: 'step-1',
          order: 0,
          agentId: 'schema-extractor',
          inputTemplate: { message: '$.trigger.bucket' },
        },
      ],
    };

    expect(fromWorkflowResponse(dto)).toEqual({
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
    });
  });

  it('defaults triggerFields to an empty array when the response omits them', () => {
    const dto = {
      id: 'wf-1',
      name: 'x',
      status: 'draft' as const,
      triggerType: 'EVENT' as const,
      createdAt: '2026-09-05T00:00:00.000Z',
      triggerFields: [],
      steps: [],
    };
    expect(fromWorkflowResponse(dto).triggerFields).toEqual([]);
  });

  it('omits optional trigger fields entirely when the response has none', () => {
    const dto = {
      id: 'wf-1',
      name: 'x',
      status: 'draft' as const,
      triggerType: 'EVENT' as const,
      createdAt: '2026-09-05T00:00:00.000Z',
      triggerFields: [],
      steps: [],
    };
    const entity = fromWorkflowResponse(dto);
    expect('eventTopic' in entity).toBe(false);
    expect('scheduleCron' in entity).toBe(false);
  });

  it('maps a step response', () => {
    const dto = {
      id: 'step-1',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    };
    expect(fromWorkflowStepResponse(dto)).toEqual({
      id: 'step-1',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });
  });

  it('maps a step response including the systemPrompt override when present', () => {
    const dto = {
      id: 'step-1',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
      systemPrompt: 'You are a terse summarizer.',
    };
    expect(fromWorkflowStepResponse(dto)).toEqual({
      id: 'step-1',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
      systemPrompt: 'You are a terse summarizer.',
    });
  });

  it('omits systemPrompt entirely when the step response has none', () => {
    const dto = {
      id: 'step-1',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    };
    expect('systemPrompt' in fromWorkflowStepResponse(dto)).toBe(false);
  });

  it('maps a run response, including per-step output and debug fields', () => {
    const dto = {
      runId: 'run-1',
      status: 'failed' as const,
      triggeredBy: 'test' as const,
      startedAt: '2026-09-06T07:00:00.000Z',
      finishedAt: '2026-09-06T07:01:00.000Z',
      steps: [
        {
          stepId: 'step-1',
          status: 'success' as const,
          output: 'schema: 12 columns',
          agentRunId: 'agent-run-1',
          startedAt: '2026-09-06T07:00:01.000Z',
          finishedAt: '2026-09-06T07:00:30.000Z',
        },
        { stepId: 'step-2', status: 'failed' as const },
      ],
      documents: [
        {
          id: 'doc-1',
          filename: 'revenue-report.md',
          mime_type: 'text/markdown',
          page_count: 1,
          extraction_status: 'extracted' as const,
          chart_previews: [{ title: 'Revenue' }],
          created_at: '2026-09-06T07:01:00.000Z',
        },
      ],
    };
    expect(fromWorkflowRunResponse(dto)).toEqual({
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
    });
  });

  it('maps a run summary response, with no step detail', () => {
    const dto = {
      runId: 'run-1',
      status: 'success' as const,
      triggeredBy: 'schedule' as const,
      startedAt: '2026-09-06T07:00:00.000Z',
      finishedAt: '2026-09-06T07:01:00.000Z',
    };
    expect(fromWorkflowRunSummaryResponse(dto)).toEqual({
      runId: 'run-1',
      status: 'success',
      triggeredBy: 'schedule',
      startedAt: '2026-09-06T07:00:00.000Z',
      finishedAt: '2026-09-06T07:01:00.000Z',
    });
  });

  it('maps create input to the request DTO shape, omitting absent optional fields', () => {
    expect(toCreateWorkflowRequest({ name: 'x', triggerType: 'EVENT' })).toEqual({
      name: 'x',
      triggerType: 'EVENT',
    });
    expect(
      toCreateWorkflowRequest({
        name: 'x',
        triggerType: 'SCHEDULE',
        scheduleCron: '0 9 * * *',
        scheduleTimezone: 'UTC',
      }),
    ).toEqual({
      name: 'x',
      triggerType: 'SCHEDULE',
      scheduleCron: '0 9 * * *',
      scheduleTimezone: 'UTC',
    });
  });

  it('includes triggerFields on the create request when provided', () => {
    expect(
      toCreateWorkflowRequest({
        name: 'x',
        triggerType: 'EVENT',
        triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
      }),
    ).toEqual({
      name: 'x',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });
  });

  it('maps update input to the request DTO shape', () => {
    expect(toUpdateWorkflowRequest({ enabled: true })).toEqual({ enabled: true });
    expect(toUpdateWorkflowRequest({ name: 'New name' })).toEqual({ name: 'New name' });
  });

  it('includes triggerFields on the update request when provided', () => {
    expect(
      toUpdateWorkflowRequest({
        triggerFields: [{ name: 'amount', type: 'number', required: false }],
      }),
    ).toEqual({
      triggerFields: [{ name: 'amount', type: 'number', required: false }],
    });
  });

  it('maps add-step input to the request DTO shape', () => {
    expect(
      toAddWorkflowStepRequest({
        agentId: 'schema-extractor',
        inputTemplate: { message: '$.trigger.bucket' },
      }),
    ).toEqual({
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
  });

  it('includes systemPrompt on the add-step request when provided', () => {
    expect(
      toAddWorkflowStepRequest({
        agentId: 'schema-extractor',
        inputTemplate: { message: '$.trigger.bucket' },
        systemPrompt: 'You are a schema extractor.',
      }),
    ).toEqual({
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a schema extractor.',
    });
  });

  it('maps update-step input to the request DTO shape, omitting unset fields', () => {
    expect(toUpdateWorkflowStepRequest({ agentId: 'summarizer' })).toEqual({
      agentId: 'summarizer',
    });
    expect(toUpdateWorkflowStepRequest({ inputTemplate: { message: '$.step1.output' } })).toEqual({
      inputTemplate: { message: '$.step1.output' },
    });
  });

  it('includes systemPrompt on the update-step request when provided', () => {
    expect(toUpdateWorkflowStepRequest({ systemPrompt: 'You are terse.' })).toEqual({
      systemPrompt: 'You are terse.',
    });
  });

  it('maps test-fire input to the request DTO shape', () => {
    expect(toTestFireWorkflowRequest({ payload: { bucket: 'x' } })).toEqual({
      payload: { bucket: 'x' },
    });
    expect(toTestFireWorkflowRequest({ payload: { bucket: 'x' }, forceFailAtStep: 2 })).toEqual({
      payload: { bucket: 'x' },
      forceFailAtStep: 2,
    });
  });

  it('maps a retry resume step to the request DTO shape', () => {
    expect(toRetryWorkflowRunRequest(2)).toEqual({ resumeFromStep: 2 });
  });
});

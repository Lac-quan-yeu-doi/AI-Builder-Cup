import { describe, expect, it, vi } from 'vitest';

import { CoreApiAutomationWorkflowRepository } from '@/src/infrastructure/repositories/core-api-automation-workflow.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { NotFoundError } from '@/src/entities/errors/application-errors';

const workflowDto = {
  id: 'wf-1',
  name: 'Ingest to Slack',
  status: 'draft' as const,
  triggerType: 'EVENT' as const,
  eventTopic: 'celesnity.ingest.file.created.v1',
  createdAt: '2026-09-05T00:00:00.000Z',
  steps: [],
  triggerFields: [],
};

function makeTransport(overrides: Partial<GeneratedApiTransport> = {}): GeneratedApiTransport {
  return {
    request: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

describe('CoreApiAutomationWorkflowRepository', () => {
  it('lists workflows via GET /automation-workflows', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue([workflowDto]) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.list();

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows', { method: 'GET' });
    expect(result).toEqual([{ ...workflowDto }]);
  });

  it('gets one workflow via GET /automation-workflows/:id, encoding the id', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(workflowDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.get('wf 1/2');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf%201%2F2', {
      method: 'GET',
    });
  });

  it('creates a workflow via POST with a JSON body', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(workflowDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.create({
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
    });

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ingest to Slack',
        triggerType: 'EVENT',
        eventTopic: 'celesnity.ingest.file.created.v1',
      }),
    });
  });

  it('updates via PATCH /automation-workflows/:id', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(workflowDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.update('wf-1', { enabled: true });

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
  });

  it('duplicates via POST /automation-workflows/:id/duplicate', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(workflowDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.duplicate('wf-1');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/duplicate', {
      method: 'POST',
    });
  });

  it('removes via DELETE /automation-workflows/:id', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(undefined) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.remove('wf-1');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1', {
      method: 'DELETE',
    });
  });

  it('adds a step via POST /automation-workflows/:id/steps', async () => {
    const stepDto = {
      id: 'step-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    };
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(stepDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.addStep('wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/steps', {
      method: 'POST',
      body: JSON.stringify({
        agentId: 'schema-extractor',
        inputTemplate: { message: '$.trigger.bucket' },
      }),
    });
    expect(result).toEqual(stepDto);
  });

  it('removes a step via DELETE /automation-workflows/:id/steps/:stepId', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(undefined) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.removeStep('wf-1', 'step-1');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/steps/step-1', {
      method: 'DELETE',
    });
  });

  it('updates a step via PATCH /automation-workflows/:id/steps/:stepId', async () => {
    const stepDto = {
      id: 'step-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    };
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(stepDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.updateStep('wf-1', 'step-1', { agentId: 'summarizer' });

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/steps/step-1', {
      method: 'PATCH',
      body: JSON.stringify({ agentId: 'summarizer' }),
    });
    expect(result).toEqual(stepDto);
  });

  it('test-fires via POST /automation-workflows/:id/test-fire', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue({ runId: 'run-1' }) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.testFire('wf-1', { payload: { bucket: 'x' } });

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/test-fire', {
      method: 'POST',
      body: JSON.stringify({ payload: { bucket: 'x' } }),
    });
    expect(result).toEqual({ runId: 'run-1' });
  });

  it('gets run status via GET /automation-workflows/:id/runs/:runId', async () => {
    const runDto = {
      runId: 'run-1',
      status: 'success' as const,
      triggeredBy: 'test' as const,
      startedAt: '2026-09-05T00:00:00.000Z',
      steps: [],
    };
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(runDto) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.getRunStatus('wf-1', 'run-1');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/runs/run-1', {
      method: 'GET',
    });
    expect(result).toEqual(runDto);
  });

  it('lists runs via GET /automation-workflows/:id/runs', async () => {
    const runSummaryDto = {
      runId: 'run-2',
      status: 'running' as const,
      triggeredBy: 'test' as const,
      startedAt: '2026-09-06T07:00:00.000Z',
    };
    const transport = makeTransport({ request: vi.fn().mockResolvedValue([runSummaryDto]) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    const result = await repository.listRuns('wf-1');

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/runs', {
      method: 'GET',
    });
    expect(result).toEqual([runSummaryDto]);
  });

  it('listRuns returns an empty array when the workflow has never run', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue([]) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    expect(await repository.listRuns('wf-1')).toEqual([]);
  });

  it('retries a run via POST /automation-workflows/:id/runs/:runId/retry', async () => {
    const transport = makeTransport({ request: vi.fn().mockResolvedValue(undefined) });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await repository.retryRun('wf-1', 'run-1', 2);

    expect(transport.request).toHaveBeenCalledWith('/automation-workflows/wf-1/runs/run-1/retry', {
      method: 'POST',
      body: JSON.stringify({ resumeFromStep: 2 }),
    });
  });

  it('translates a 404 into a NotFoundError', async () => {
    const transport = makeTransport({
      request: vi.fn().mockRejectedValue(new CoreApiError(404, 'not found')),
    });
    const repository = new CoreApiAutomationWorkflowRepository(transport);

    await expect(repository.get('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

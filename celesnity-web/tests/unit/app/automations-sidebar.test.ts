// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutomationsSidebar } from '@/app/(workspace)/chat/_components/automations-sidebar';
import { renderUi } from '@/tests/support/render-ui';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { AutomationWorkflowViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

// A workflow that declares typed trigger fields. The step also references a
// prior-step output ($.step1.output) which must NEVER be prompted for.
const typedWorkflow: AutomationWorkflowViewModel = {
  id: 'wf-event',
  name: 'Demo: new order alert',
  status: 'enabled',
  triggerType: 'EVENT',
  eventTopic: 'celesnity.demo.order.v1',
  createdAt: '2026-09-04T00:00:00.000Z',
  triggerFields: [
    { name: 'customer_name', type: 'text', required: true },
    { name: 'amount', type: 'number', required: true },
    { name: 'run_date', type: 'date', required: true },
    { name: 'run_at', type: 'datetime', required: true },
    { name: 'urgent', type: 'boolean', required: false },
  ],
  steps: [
    {
      id: 'step-1',
      order: 1,
      agentId: 'chat-assistant',
      inputTemplate: {
        message: 'Order from $.trigger.customer_name for $.trigger.amount.',
      },
    },
    {
      id: 'step-2',
      order: 2,
      agentId: 'summarizer',
      inputTemplate: { message: 'Summarize $.step1.output' },
    },
  ],
};

const scheduleWorkflow: AutomationWorkflowViewModel = {
  id: 'wf-schedule',
  name: 'Demo: daily summary',
  status: 'enabled',
  triggerType: 'SCHEDULE',
  scheduleCron: '0 9 * * *',
  createdAt: '2026-09-04T00:00:00.000Z',
  triggerFields: [],
  steps: [
    {
      id: 'step-1',
      order: 1,
      agentId: 'chat-assistant',
      inputTemplate: { message: "Summarize yesterday's demo orders." },
    },
  ],
};

function controllerOf(
  overrides: Partial<AutomationWorkflowController>,
): AutomationWorkflowController {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    addStep: vi.fn(),
    removeStep: vi.fn(),
    updateStep: vi.fn(),
    testFire: vi.fn(async () => ({ runId: 'run-1' })),
    getRunStatus: vi.fn(),
    listRuns: vi.fn(async () => []),
    retryRun: vi.fn(),
    ...overrides,
  } as AutomationWorkflowController;
}

afterEach(() => {
  cleanup();
});

describe('AutomationsSidebar', () => {
  it('lists workflow names on the root view, with no inputs until drilled into', async () => {
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [typedWorkflow, scheduleWorkflow]),
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByText('Demo: new order alert')).toBeDefined();
    });
    expect(screen.getByText('Demo: daily summary')).toBeDefined();
    expect(screen.queryByLabelText('customer_name')).toBeNull();

    fireEvent.click(screen.getByText('Demo: new order alert'));

    expect(screen.getByLabelText('customer_name')).toBeDefined();
    expect(screen.getByLabelText('amount')).toBeDefined();
    expect(screen.queryByText('Demo: daily summary')).toBeNull();
  });

  it('renders each declared trigger field by its type, and never prompts for step outputs', async () => {
    const automationWorkflow = controllerOf({ list: vi.fn(async () => [typedWorkflow]) });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());
    fireEvent.click(screen.getByText('Demo: new order alert'));

    expect(screen.getByLabelText('customer_name')).toHaveProperty('type', 'text');
    expect(screen.getByLabelText('amount')).toHaveProperty('type', 'number');
    expect(screen.getByLabelText('run_date')).toHaveProperty('type', 'date');
    expect(screen.getByLabelText('run_at')).toHaveProperty('type', 'datetime-local');
    expect(screen.getByLabelText('urgent')).toHaveProperty('type', 'checkbox');

    // The prior-step output reference must not surface as an input.
    expect(screen.queryByLabelText('step1')).toBeNull();
    expect(screen.queryByLabelText('output')).toBeNull();
    expect(screen.queryByLabelText('step1.output')).toBeNull();
  });

  it('a back click returns from the detail view to the root list', async () => {
    const automationWorkflow = controllerOf({ list: vi.fn(async () => [typedWorkflow]) });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());

    fireEvent.click(screen.getByText('Demo: new order alert'));
    expect(screen.getByLabelText('customer_name')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Automations' }));

    expect(screen.queryByLabelText('customer_name')).toBeNull();
    expect(screen.getByText('Demo: new order alert')).toBeDefined();
  });

  it('disables Run now until every required field has a value, but not for a workflow with no required fields', async () => {
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [typedWorkflow, scheduleWorkflow]),
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());

    fireEvent.click(screen.getByText('Demo: new order alert'));
    const eventRunButton = screen.getByRole('button', { name: 'Run now' });
    expect(eventRunButton).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('customer_name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '4820' } });
    fireEvent.change(screen.getByLabelText('run_date'), { target: { value: '2026-09-07' } });
    fireEvent.change(screen.getByLabelText('run_at'), {
      target: { value: '2026-09-07T09:00' },
    });
    // urgent is optional — leaving it unchecked must not block the run.
    expect(eventRunButton).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'Automations' }));
    fireEvent.click(screen.getByText('Demo: daily summary'));
    expect(screen.getByRole('button', { name: 'Run now' })).toHaveProperty('disabled', false);
  });

  it('fires with a coerced typed payload and shows a "View run" button once a run id comes back', async () => {
    const testFire = vi.fn(async () => ({ runId: 'run-1' }));
    const onInspectRun = vi.fn();
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [typedWorkflow]),
      testFire,
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());
    fireEvent.click(screen.getByText('Demo: new order alert'));

    fireEvent.change(screen.getByLabelText('customer_name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '4820' } });
    fireEvent.change(screen.getByLabelText('run_date'), { target: { value: '2026-09-07' } });
    fireEvent.change(screen.getByLabelText('run_at'), {
      target: { value: '2026-09-07T09:00' },
    });
    fireEvent.click(screen.getByLabelText('urgent'));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(testFire).toHaveBeenCalledWith('wf-event', {
        payload: {
          customer_name: 'Acme Corp',
          amount: 4820,
          run_date: '2026-09-07',
          run_at: '2026-09-07T09:00',
          urgent: true,
        },
      });
    });

    const viewRunButton = await screen.findByRole('button', { name: 'View run' });
    fireEvent.click(viewRunButton);
    expect(onInspectRun).toHaveBeenCalledWith('run-1');
  });

  it('falls back to trigger-ref-derived text fields when no triggerFields are declared, excluding step outputs', async () => {
    const fallbackWorkflow: AutomationWorkflowViewModel = {
      ...typedWorkflow,
      id: 'wf-fallback',
      triggerFields: [],
    };
    const testFire = vi.fn(async () => ({ runId: 'run-1' }));
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [fallbackWorkflow]),
      testFire,
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());
    fireEvent.click(screen.getByText('Demo: new order alert'));

    // Only the two $.trigger.* refs are prompted — the $.step1.output is not.
    expect(screen.getByLabelText('customer_name')).toHaveProperty('type', 'text');
    expect(screen.getByLabelText('amount')).toHaveProperty('type', 'text');
    expect(screen.queryByLabelText('output')).toBeNull();

    fireEvent.change(screen.getByLabelText('customer_name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '4820.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(testFire).toHaveBeenCalledWith('wf-fallback', {
        payload: { customer_name: 'Acme Corp', amount: '4820.00' },
      });
    });
  });

  it('marks a disabled workflow in the root list', async () => {
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [{ ...typedWorkflow, status: 'draft' as const }]),
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: new order alert')).toBeDefined());
    expect(screen.getByText(/Disabled/)).toBeDefined();
  });

  it('fetches and shows run history automatically once drilled into a workflow', async () => {
    const listRuns = vi.fn(async () => [
      {
        runId: 'run-1',
        status: 'success' as const,
        triggeredBy: 'schedule' as const,
        startedAt: '2026-09-04T09:00:00.000Z',
      },
      {
        runId: 'run-2',
        status: 'success' as const,
        triggeredBy: 'schedule' as const,
        startedAt: '2026-09-03T09:00:00.000Z',
      },
    ]);
    const automationWorkflow = controllerOf({
      list: vi.fn(async () => [scheduleWorkflow]),
      listRuns,
    });
    renderUi(createElement(AutomationsSidebar, { automationWorkflow, onInspectRun: vi.fn() }));
    await waitFor(() => expect(screen.getByText('Demo: daily summary')).toBeDefined());

    expect(listRuns).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Demo: daily summary'));

    await waitFor(() => {
      expect(listRuns).toHaveBeenCalledWith('wf-schedule');
    });
    expect(await screen.findAllByText(/success/)).toHaveLength(2);
  });
});

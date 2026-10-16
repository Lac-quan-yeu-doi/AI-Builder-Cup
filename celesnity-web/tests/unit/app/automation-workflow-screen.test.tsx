// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { AutomationWorkflowViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import { renderUi } from '@/tests/support/render-ui';
import { useAssistantPanelStore } from '@/app/_stores/assistant-panel.store';

import { AutomationWorkflowScreen } from '@/app/(workspace)/automations/_components/automation-workflow-screen';

const ORIGINAL_AGENT_NAME = process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = 'automation-workflow-editor';
  // jsdom reports no matching media query, so the panel would default closed
  // the way it does on a narrow viewport. These tests are about the docked one.
  useAssistantPanelStore.setState({ openOverrides: { 'automations-list': true } });
});
afterAll(() => {
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = ORIGINAL_AGENT_NAME;
  useAssistantPanelStore.setState({ openOverrides: {}, widths: {} });
});

function workflow(
  overrides: Partial<AutomationWorkflowViewModel> = {},
): AutomationWorkflowViewModel {
  return {
    id: 'wf-1',
    name: 'Existing workflow',
    status: 'enabled',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.file.created.v1',
    createdAt: '2026-09-08T00:00:00.000Z',
    triggerFields: [],
    steps: [],
    ...overrides,
  };
}

function controllerWith(workflows: readonly AutomationWorkflowViewModel[]) {
  return {
    list: vi.fn().mockResolvedValue(workflows),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    addStep: vi.fn(),
    removeStep: vi.fn(),
    updateStep: vi.fn(),
    testFire: vi.fn(),
    getRunStatus: vi.fn(),
    listRuns: vi.fn(),
    retryRun: vi.fn(),
  } as unknown as AutomationWorkflowController;
}

afterEach(() => cleanup());

describe('AutomationWorkflowScreen — event topic assistant', () => {
  it('shows unique event topics and excludes schedule workflows', async () => {
    const controller = controllerWith([
      workflow(),
      workflow({ id: 'wf-2', name: 'Duplicate topic', eventTopic: 'celesnity.file.created.v1' }),
      workflow({
        id: 'wf-3',
        name: 'Scheduled workflow',
        triggerType: 'SCHEDULE',
        eventTopic: undefined,
        scheduleCron: '0 8 * * *',
        scheduleTimezone: 'UTC',
      }),
      workflow({ id: 'wf-4', name: 'Order workflow', eventTopic: 'celesnity.order.created.v1' }),
    ]);

    renderUi(createElement(AutomationWorkflowScreen, { controller }));

    expect(await screen.findByText('Event topic assistant')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /Use topic celesnity.file.created.v1/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: /Use topic celesnity.order.created.v1/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Use topic 0 8 \* \* \*/ })).toBeNull();
  });

  it('keeps the workflow assistant in the outer right dock', async () => {
    const controller = controllerWith([workflow()]);
    renderUi(createElement(AutomationWorkflowScreen, { controller }));

    const assistant = await screen.findByRole('complementary', { name: 'Event topic assistant' });
    // The panel carries its own frame now: the left border and the 400px
    // column arrive with it rather than from a wrapper on this screen.
    expect(assistant.className).toContain('min-[1080px]:border-l');
    expect(assistant.className).toContain('min-[1080px]:w-[var(--assistant-panel-width)]');
    expect(await screen.findByText('Event topic assistant')).toBeTruthy();
    expect(screen.getByRole('main').className).toContain('overflow-y-auto');
  });

  it('opens create dialog with the selected existing topic', async () => {
    const controller = controllerWith([workflow()]);
    renderUi(createElement(AutomationWorkflowScreen, { controller }));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Use topic celesnity.file.created.v1' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New automation workflow' })).toBeTruthy(),
    );
    expect(screen.getByLabelText('Event topic')).toHaveProperty(
      'value',
      'celesnity.file.created.v1',
    );
  });
});

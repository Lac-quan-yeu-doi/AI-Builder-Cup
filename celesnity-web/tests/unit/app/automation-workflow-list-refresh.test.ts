// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { AutomationWorkflowViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import { renderUi } from '@/tests/support/render-ui';
import { useAssistantPanelStore } from '@/app/_stores/assistant-panel.store';

const { capturedPanelProps } = vi.hoisted(() => ({
  capturedPanelProps: { current: null as null | Record<string, unknown> },
}));

vi.mock(
  '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel',
  () => ({
    AutomationWorkflowChatPanel: (props: Record<string, unknown>) => {
      capturedPanelProps.current = props;
      return createElement('aside', { 'aria-label': 'Workflow assistant' });
    },
  }),
);

import { AutomationWorkflowScreen } from '@/app/(workspace)/automations/_components/automation-workflow-screen';

// jsdom matches no media query, so the panel would default closed the way it
// does on a narrow viewport. These tests read the props it is handed.
useAssistantPanelStore.setState({ openOverrides: { 'automations-list': true } });

function workflow(
  overrides: Partial<AutomationWorkflowViewModel> = {},
): AutomationWorkflowViewModel {
  return {
    id: 'wf-1',
    name: 'Existing workflow',
    status: 'draft',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.startup.v1',
    createdAt: '2026-09-08T00:00:00.000Z',
    triggerFields: [],
    steps: [],
    ...overrides,
  };
}

function controllerWithList(list: ReturnType<typeof vi.fn>) {
  return {
    list,
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

afterEach(() => {
  cleanup();
  capturedPanelProps.current = null;
});

describe('AutomationWorkflowScreen — assistant refresh', () => {
  it('reloads the workflow list when the assistant reports a completed run', async () => {
    const initial = workflow();
    const created = workflow({
      id: 'wf-2',
      name: 'Auto data analytics on startup',
    });
    const list = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([created, initial]);
    const controller = controllerWithList(list);

    renderUi(createElement(AutomationWorkflowScreen, { controller }));
    expect(await screen.findByText('Existing workflow')).toBeTruthy();

    const onWorkflowChanged = capturedPanelProps.current?.onWorkflowChanged;
    expect(onWorkflowChanged).toEqual(expect.any(Function));

    act(() => {
      (onWorkflowChanged as () => void)();
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Auto data analytics on startup')).toBeTruthy();
  });

  it('keeps the refreshed workflow list when the initial request resolves afterward', async () => {
    const initial = workflow();
    const created = workflow({
      id: 'wf-2',
      name: 'Auto data analytics on startup',
    });
    let resolveInitial: ((value: readonly AutomationWorkflowViewModel[]) => void) | undefined;
    const initialResponse = new Promise<readonly AutomationWorkflowViewModel[]>((resolve) => {
      resolveInitial = resolve;
    });
    const list = vi
      .fn()
      .mockReturnValueOnce(initialResponse)
      .mockResolvedValueOnce([created, initial]);
    const controller = controllerWithList(list);

    renderUi(createElement(AutomationWorkflowScreen, { controller }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    const onWorkflowChanged = capturedPanelProps.current?.onWorkflowChanged;
    expect(onWorkflowChanged).toEqual(expect.any(Function));

    act(() => {
      (onWorkflowChanged as () => void)();
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Auto data analytics on startup')).toBeTruthy();

    await act(async () => {
      resolveInitial?.([initial]);
      await initialResponse;
    });

    expect(screen.getByText('Auto data analytics on startup')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { capturedChatPanelProps } = vi.hoisted(() => ({
  capturedChatPanelProps: { current: null as null | Record<string, unknown> },
}));

vi.mock(
  '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel',
  () => ({
    AutomationWorkflowChatPanel: (props: Record<string, unknown>) => {
      capturedChatPanelProps.current = props;
      return <div>chat panel</div>;
    },
  }),
);

import { AutomationWorkflowDock } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-dock';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

const step: AutomationWorkflowStepViewModel = {
  id: 'step-1',
  order: 0,
  agentId: 'schema-extractor',
  inputTemplate: {},
};

afterEach(() => {
  cleanup();
  capturedChatPanelProps.current = null;
});

describe('AutomationWorkflowDock', () => {
  it('defaults to the Chat tab and forwards workflow props to the chat panel', () => {
    render(
      createElement(AutomationWorkflowDock, {
        workflowId: 'wf-1',
        workflowName: 'Ingest to Slack',
        onWorkflowChanged: vi.fn(),
        selectedStep: null,
        stepBusy: false,
        onSaveStep: vi.fn(),
        onRemoveStep: vi.fn(),
      }),
    );
    expect(screen.getByText('chat panel')).toBeTruthy();
    expect(capturedChatPanelProps.current).toMatchObject({
      workflowId: 'wf-1',
      workflowName: 'Ingest to Slack',
    });
  });

  it('starts on the Step tab when a step is already selected', () => {
    render(
      createElement(AutomationWorkflowDock, {
        workflowId: 'wf-1',
        workflowName: 'Ingest to Slack',
        onWorkflowChanged: vi.fn(),
        selectedStep: step,
        stepBusy: false,
        onSaveStep: vi.fn(),
        onRemoveStep: vi.fn(),
      }),
    );
    expect(screen.getByDisplayValue('schema-extractor')).toBeTruthy();
  });

  it('clicking the Chat tab switches away from the Step inspector without unmounting the chat panel', () => {
    render(
      createElement(AutomationWorkflowDock, {
        workflowId: 'wf-1',
        workflowName: 'Ingest to Slack',
        onWorkflowChanged: vi.fn(),
        selectedStep: step,
        stepBusy: false,
        onSaveStep: vi.fn(),
        onRemoveStep: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByText('chat panel')).toBeTruthy();
    expect(capturedChatPanelProps.current).not.toBeNull();
  });
});

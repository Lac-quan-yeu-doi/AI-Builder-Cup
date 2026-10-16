// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';

// The panel's own automationWorkflowChatAgentName() throws if unset (the app
// layer can't import publicEnvironment directly — see
// tests/unit/app/frameworks-layer.test.ts) — stub a real value for most
// tests here, matching agent-api-chat.repository.test.ts's equivalent stub
// for the general chat agent's env var.
const ORIGINAL_AGENT_NAME = process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = 'automation-workflow-editor';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = ORIGINAL_AGENT_NAME;
});

const { sendMessage, getInjection } = vi.hoisted(() => ({
  sendMessage: vi.fn().mockResolvedValue({
    runId: 'run-1',
    roomId: 'room-1',
    roomEventsUrl: '/events',
    queuePosition: 0,
  }),
  getInjection: vi.fn((key: string) => {
    if (key === 'ManageChatController') {
      return {
        sendMessage,
        getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        streamEvents: vi.fn().mockResolvedValue(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          }),
        ),
      };
    }
    if (key === 'ListMessageBlockHistoryController') return vi.fn().mockResolvedValue([]);
    if (key === 'SubscribeMessageBlocksController')
      return vi.fn().mockReturnValue({ close: vi.fn() });
    if (key === 'ListPendingActionsController') return vi.fn().mockResolvedValue([]);
    if (key === 'ResolveCitationsController') return vi.fn().mockResolvedValue([]);
    return vi.fn();
  }),
}));

vi.mock('@/di/container', () => ({ getInjection }));

import { AutomationWorkflowChatPanel } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel';

afterEach(() => {
  cleanup();
  sendMessage.mockClear();
});

describe('AutomationWorkflowChatPanel', () => {
  it('sends a seeded context message once, before the user’s first real message', async () => {
    renderUi(
      createElement(AutomationWorkflowChatPanel, {
        workflowId: 'wf-1',
        workflowName: 'Ingest to Slack',
        onWorkflowChanged: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'add a slack step' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const firstCallMessage = sendMessage.mock.calls[0]?.[0]?.message as string;
    expect(firstCallMessage).toContain('wf-1');
    expect(firstCallMessage).toContain('Ingest to Slack');
    expect(firstCallMessage).toContain('add a slack step');
  });

  it('seeds workflow-list context when no workflow is selected', async () => {
    renderUi(
      createElement(AutomationWorkflowChatPanel, {
        workflowName: 'Workflow assistant',
      }),
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'help me create a workflow' },
    });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const firstCallMessage = sendMessage.mock.calls[0]?.[0]?.message as string;
    expect(firstCallMessage).toContain('workflow list');
    expect(firstCallMessage).not.toContain('undefined');
  });
  it('throws a clear error when the agent name env var is unset', () => {
    const original = process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
    delete process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
    try {
      expect(() =>
        renderUi(
          createElement(AutomationWorkflowChatPanel, {
            workflowId: 'wf-1',
            workflowName: 'Ingest to Slack',
            onWorkflowChanged: vi.fn(),
          }),
        ),
      ).toThrow(/NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME is required/);
    } finally {
      process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = original;
    }
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';

const { capturedOptions, getInjection } = vi.hoisted(() => ({
  capturedOptions: { current: null as null | Record<string, unknown> },
  getInjection: vi.fn(() => vi.fn()),
}));

vi.mock('@/di/container', () => ({ getInjection }));
vi.mock('@/app/_components/chat/use-chat-conversation', () => ({
  useChatConversation: (options: Record<string, unknown>) => {
    capturedOptions.current = options;
    return {
      error: null,
      isStreaming: false,
      send: vi.fn(),
    };
  },
}));

import { AutomationWorkflowChatPanel } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel';

afterEach(() => {
  cleanup();
  capturedOptions.current = null;
});

describe('AutomationWorkflowChatPanel — workflow refresh events', () => {
  it('refreshes after a namespaced create_workflow tool completes', () => {
    const onWorkflowChanged = vi.fn();
    process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = 'automation-workflow-editor';

    renderUi(
      createElement(AutomationWorkflowChatPanel, {
        context: 'workflow-list',
        onWorkflowChanged,
        workflowName: 'Workflow assistant',
      }),
    );

    const onToolFinished = capturedOptions.current?.['onToolFinished'];
    expect(onToolFinished).toEqual(expect.any(Function));

    act(() => {
      if (typeof onToolFinished === 'function') {
        onToolFinished('mcp__automation_workflow__create_workflow');
      }
    });

    expect(onWorkflowChanged).toHaveBeenCalledTimes(1);
  });
});

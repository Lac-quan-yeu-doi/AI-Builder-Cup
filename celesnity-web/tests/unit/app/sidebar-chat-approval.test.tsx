// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ChatConversationStore } from '@/app/_components/chat/use-chat-conversation';
import { renderUi } from '@/tests/support/render-ui';

const mocks = vi.hoisted(() => ({
  decideApproval: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  pendingApprovalMessage: {
    id: 'assistant-approval-1',
    role: 'assistant' as const,
    content: '',
    timestamp: '2026-09-17T07:22:00.000Z',
    runId: 'runtime-run-1',
    runAwaitingApproval: true,
    awaitingApproval: {
      approvalId: 'approval-1',
      action: 'mcp__skill__create_skill',
      preview: 'Create a data exploration skill',
      expiresAt: '2027-09-17T07:22:00.000Z',
    },
  },
}));

vi.mock('@/di/container', () => ({
  getInjection: (name: string) => {
    if (name === 'ListPendingActionsController') return vi.fn().mockResolvedValue([]);
    if (name === 'ResolveCitationsController') return vi.fn().mockResolvedValue([]);
    return vi.fn();
  },
}));

vi.mock('@/app/_components/chat/use-chat-conversation', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useChatConversation: ({ store }: { readonly store: ChatConversationStore }) => {
      react.useEffect(() => {
        store.setMessages(() => [mocks.pendingApprovalMessage]);
      }, []);

      return {
        isStreaming: false,
        error: null,
        send: mocks.send,
        disconnect: vi.fn(),
        decideApproval: mocks.decideApproval,
      };
    },
  };
});

import { AutomationWorkflowChatPanel } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel';
import { PlantModelChatPanel } from '@/app/(workspace)/plant-model/[siteId]/_components/plant-model-chat-panel';
import { SkillsChatPanel } from '@/app/(workspace)/skills/_components/skills-chat-panel';
import type { PlantModelDraft, PlantSite } from '@/src/entities/models/plant-model';

const ORIGINAL_SKILL_AGENT = process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
const ORIGINAL_AUTOMATION_AGENT = process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
const ORIGINAL_PLANT_AGENT = process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = 'skill-creator';
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = 'automation-workflow-editor';
  process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = 'plant-model-assistant';
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = ORIGINAL_SKILL_AGENT;
  process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME = ORIGINAL_AUTOMATION_AGENT;
  process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = ORIGINAL_PLANT_AGENT;
});

afterEach(() => {
  cleanup();
  mocks.decideApproval.mockClear();
  mocks.send.mockClear();
});

const draft: PlantModelDraft = { nodeTypes: [], nodes: [], relationships: [] };
const site = {
  id: 'site-1',
  name: 'Factory 1',
  code: 'F1',
  timezone: 'UTC',
  draft,
  revision: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} satisfies PlantSite;

async function approveVisibleRuntimeRequest(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() =>
    expect(mocks.decideApproval).toHaveBeenCalledWith('runtime-run-1', 'approval-1', 'approved'),
  );
}

describe('sidebar runtime approvals', () => {
  it('sends only the user text on the first Skills-page message', async () => {
    renderUi(createElement(SkillsChatPanel, {}));

    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy());
    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'create a data exploring skill' } });
    fireEvent.keyDown(textbox, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('create a data exploring skill'));
  });

  it('lets a Skills sidebar user approve the paused tool run', async () => {
    renderUi(createElement(SkillsChatPanel, {}));

    await approveVisibleRuntimeRequest();
  });

  it('lets an Automation sidebar user approve the paused tool run', async () => {
    renderUi(
      createElement(AutomationWorkflowChatPanel, {
        workflowId: 'workflow-1',
        workflowName: 'Monthly report',
      }),
    );

    await approveVisibleRuntimeRequest();
  });

  it('lets a Plant Model sidebar user approve the paused tool run', async () => {
    renderUi(createElement(PlantModelChatPanel, { site, draft, close: vi.fn() }));

    await approveVisibleRuntimeRequest();
  });
});

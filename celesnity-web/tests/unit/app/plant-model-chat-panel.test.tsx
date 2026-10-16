// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hookOptions: undefined as Record<string, unknown> | undefined,
  resetConversation: vi.fn(),
  send: vi.fn(),
  disconnect: vi.fn(),
  startNewConversation: vi.fn(),
}));

vi.mock('@/di/container', () => ({
  getInjection: (name: string) =>
    name === 'ManageChatController' ? { resetConversation: mocks.resetConversation } : vi.fn(),
}));

vi.mock('@/app/_providers/current-user-provider', () => ({
  useCurrentUserId: () => 'user-1',
}));

vi.mock('@/app/_i18n/use-translation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/app/_components/assistant/use-scoped-assistant-conversation', () => ({
  useScopedAssistantConversation: (options: Record<string, unknown>) => {
    mocks.hookOptions = options;
    return {
      controllers: {},
      activeConversationId: null,
      history: [],
      historyLoading: false,
      messages: [],
      setMessages: vi.fn(),
      isStreaming: false,
      error: null,
      send: mocks.send,
      decideApproval: vi.fn(),
      selectConversation: vi.fn(),
      startNewConversation: mocks.startNewConversation,
    };
  },
}));

vi.mock('@/app/_components/chat/chat-composer', () => ({
  ChatComposer: ({ onSubmit }: { onSubmit: (text: string) => void }) => (
    <button type="button" onClick={() => onSubmit('/new')}>
      submit-new
    </button>
  ),
}));

vi.mock('@/app/_components/chat/chat-message-list', () => ({
  ChatMessageList: () => null,
}));

import { PlantModelChatPanel } from '@/app/(workspace)/plant-model/[siteId]/_components/plant-model-chat-panel';
import type { PlantModelDraft, PlantSite } from '@/src/entities/models/plant-model';

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

const ORIGINAL_AGENT_NAME = process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = 'plant-model-assistant';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = ORIGINAL_AGENT_NAME;
});

describe('PlantModelChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hookOptions = undefined;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(cleanup);

  it('uses the dedicated assistant and server-owned constant-size scope', () => {
    render(<PlantModelChatPanel site={site} draft={draft} close={vi.fn()} />);

    expect(mocks.hookOptions).toEqual(
      expect.objectContaining({
        agentName: 'plant-model-assistant',
        conversationNamespace: 'plant-model:site-1',
        plantModelScope: {
          plantSiteId: 'site-1',
          draftRevision: 2,
        },
      }),
    );
  });

  it('uses the Plant Model agent configured for this deployment', () => {
    const original = process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;
    process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = 'facility-model-agent';
    try {
      render(<PlantModelChatPanel site={site} draft={draft} close={vi.fn()} />);

      expect(mocks.hookOptions).toEqual(
        expect.objectContaining({ agentName: 'facility-model-agent' }),
      );
    } finally {
      process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = original;
    }
  });

  it('throws a clear error when the agent name env var is unset', () => {
    const original = process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;
    delete process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;
    try {
      expect(() =>
        render(<PlantModelChatPanel site={site} draft={draft} close={vi.fn()} />),
      ).toThrow(/NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME is required/);
    } finally {
      process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME = original;
    }
  });

  it('refreshes the workspace after a namespaced model mutation completes', () => {
    const onModelChanged = vi.fn();
    render(
      <PlantModelChatPanel
        site={site}
        draft={draft}
        close={vi.fn()}
        onModelChanged={onModelChanged}
      />,
    );

    const onToolFinished = mocks.hookOptions?.['onToolFinished'];
    expect(onToolFinished).toEqual(expect.any(Function));
    if (typeof onToolFinished === 'function') {
      onToolFinished('mcp__plant_model__save_plant_model');
    }
    expect(onModelChanged).toHaveBeenCalledOnce();
  });

  it('handles slash-new locally without creating an LLM run', async () => {
    render(<PlantModelChatPanel site={site} draft={draft} close={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'submit-new' }));

    await waitFor(() => expect(mocks.startNewConversation).toHaveBeenCalledOnce());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.resetConversation).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';

// The panel's own skillChatAgentName() throws if unset (the app layer can't
// import publicEnvironment directly — see tests/unit/app/frameworks-layer.test.ts),
// so stub a real value for most tests here, matching the automation panel test.
const ORIGINAL_AGENT_NAME = process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = 'skill-creator';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = ORIGINAL_AGENT_NAME;
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

import { SkillsChatPanel } from '@/app/(workspace)/skills/_components/skills-chat-panel';

afterEach(() => {
  cleanup();
  sendMessage.mockClear();
});

describe('SkillsChatPanel', () => {
  it('renders the skill assistant header', () => {
    renderUi(createElement(SkillsChatPanel, {}));
    expect(screen.getByRole('heading', { name: /skill assistant/i })).toBeTruthy();
  });

  it('sends the user message without leaking authoring instructions into the transcript', async () => {
    renderUi(createElement(SkillsChatPanel, { onSkillsChanged: vi.fn() }));

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'make a sql review skill' },
    });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const firstCallMessage = sendMessage.mock.calls[0]?.[0]?.message as string;
    expect(firstCallMessage).toBe('make a sql review skill');
  });

  it('throws a clear error when the agent name env var is unset', () => {
    const original = process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
    delete process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
    try {
      expect(() => renderUi(createElement(SkillsChatPanel, {}))).toThrow(
        /NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME is required/,
      );
    } finally {
      process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = original;
    }
  });
});

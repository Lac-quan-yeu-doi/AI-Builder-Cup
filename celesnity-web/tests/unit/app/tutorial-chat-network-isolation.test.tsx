// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { renderUi as render } from '@/tests/support/render-ui';

const { liveChatScreen, simulatorScreen } = vi.hoisted(() => ({
  liveChatScreen: vi.fn(() => createElement('div', null, 'live chat')),
  simulatorScreen: vi.fn(() => createElement('div', null, 'tutorial simulator')),
}));

vi.mock('@/di/container', () => ({ getInjection: vi.fn(() => vi.fn()) }));
vi.mock('@/app/(workspace)/chat/_components/chat-screen', () => ({
  ChatScreen: liveChatScreen,
}));
vi.mock('@/app/(workspace)/chat/_components/tutorial-agent-chat-screen', () => ({
  TutorialAgentChatScreen: simulatorScreen,
}));

import { ChatFeature } from '@/app/(workspace)/chat/_components/chat-feature';

describe('simulated tutorial Chat isolation', () => {
  beforeEach(() => {
    useTutorialSessionStore.getState().setActiveExperience({
      mode: 'SIMULATED_CHAT',
      scenarioId: 'agent-ask-data',
      scenarioVersion: 1,
      resumePolicy: 'RESTART',
    });
  });

  afterEach(() => {
    cleanup();
    liveChatScreen.mockClear();
    simulatorScreen.mockClear();
    useTutorialSessionStore.getState().setActiveExperience(null);
  });

  it('mounts only the in-memory simulator and never the live Chat runtime', () => {
    render(createElement(ChatFeature));
    expect(screen.getByText('tutorial simulator')).toBeTruthy();
    expect(simulatorScreen).toHaveBeenCalledOnce();
    expect(liveChatScreen).not.toHaveBeenCalled();
  });
});

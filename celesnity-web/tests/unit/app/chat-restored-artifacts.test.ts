// @vitest-environment jsdom

import { createElement, useState } from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import {
  useChatConversation,
  type ChatConversationStore,
} from '@/app/_components/chat/use-chat-conversation';
import type { DisplayMessage, MessageBlock } from '@/app/_components/chat/types';

const chartBlock: MessageBlock = {
  id: 'block-1',
  runId: 'run-from-yesterday',
  blockType: 'chart',
  payload: { title: 'Max temperature by machine' },
  fallbackText: '',
  publishedAt: '2026-09-14T08:00:00.000Z',
};

function controllers(history: readonly MessageBlock[]) {
  return {
    controller: {
      sendMessage: vi.fn(),
      // The shape a reload gets back: text, and nothing that names a run.
      getSessionTranscript: vi.fn().mockResolvedValue([
        { role: 'user', content: 'which machine ran hottest?', reasoning: null },
        { role: 'assistant', content: 'Machine 3.', reasoning: null },
      ]),
      streamEvents: vi.fn().mockResolvedValue(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.close();
          },
        }),
      ),
    },
    listMessageBlockHistory: vi.fn().mockResolvedValue(history),
    subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
  };
}

function Harness({ history }: { readonly history: readonly MessageBlock[] }) {
  const [messages, setMessages] = useState<readonly DisplayMessage[]>([]);
  const wiring = controllers(history);
  const store: ChatConversationStore = {
    messages,
    roomId: 'room-1',
    setMessages: (updater) => setMessages((previous) => updater(previous)),
    setRoomId: () => undefined,
  };

  const { restoredArtifacts } = useChatConversation({
    roomKey: 'room-key',
    userId: 'local-owner',
    controller: wiring.controller as never,
    listMessageBlockHistory: wiring.listMessageBlockHistory as never,
    subscribeMessageBlocks: wiring.subscribeMessageBlocks as never,
    store,
  });

  return createElement('p', null, restoredArtifacts.map((block) => block.id).join(',') || 'none');
}

afterEach(cleanup);

describe('artifacts after a reload', () => {
  it('keeps a chart the conversation produced, which the transcript cannot claim', async () => {
    renderUi(createElement(Harness, { history: [chartBlock] }));

    // Before this, the block found no message with a matching run id, went into
    // a ref, and was never rendered again: the text came back, the chart did not.
    await waitFor(() => expect(screen.getByText('block-1')).toBeTruthy());
  });

  it('holds nothing when the conversation produced no artifact', async () => {
    renderUi(
      createElement(Harness, {
        history: [{ ...chartBlock, id: 'prose', blockType: 'markdown' }],
      }),
    );

    await waitFor(() => expect(screen.getByText('none')).toBeTruthy());
  });
});

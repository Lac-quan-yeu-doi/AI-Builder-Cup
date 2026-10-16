import { describe, expect, it } from 'vitest';

import type { DisplayMessage } from '@/app/_components/chat/types';
import {
  hydrateChatRunHistory,
  type ChatHistoryRun,
} from '@/app/_components/chat/chat-run-history';

describe('hydrateChatRunHistory', () => {
  it('restores ordered tool activity and event trace on an existing assistant turn', () => {
    const messages: readonly DisplayMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'List sales',
        timestamp: '2026-09-16T09:00:00.000Z',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Sales are up.',
        timestamp: '2026-09-16T09:00:01.000Z',
      },
    ];
    const runs: readonly ChatHistoryRun[] = [
      {
        runId: 'run-1',
        sessionId: 'session-1',
        input: 'List sales',
        status: 'completed',
        createdAt: '2026-09-16T09:00:00.500Z',
        finishedAt: '2026-09-16T09:00:02.000Z',
        responseText: 'Sales are up.',
        events: [
          {
            seq: 1,
            payload: {
              type: 'tool_started',
              data: { id: 'tool-1', name: 'list_catalogs', arguments: {} },
            },
          },
          {
            seq: 2,
            payload: {
              type: 'tool_finished',
              data: { id: 'tool-1', name: 'list_catalogs', success: true },
            },
          },
          {
            seq: 3,
            payload: { type: 'done', data: { response_text: 'Sales are up.' } },
          },
        ],
      },
    ];

    const hydrated = hydrateChatRunHistory(messages, runs);
    expect(hydrated[1]).toMatchObject({
      runId: 'run-1',
      toolActivity: [{ id: 'tool-1', name: 'list_catalogs', status: 'done' }],
      eventTrace: [
        { seq: 1, type: 'tool_started' },
        { seq: 2, type: 'tool_finished' },
        { seq: 3, type: 'done' },
      ],
    });
  });

  it('keeps the arguments a tool was started with once it has finished', () => {
    const messages: readonly DisplayMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Which tables?',
        timestamp: '2026-09-26T09:00:00.000Z',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Two.',
        timestamp: '2026-09-26T09:00:01.000Z',
      },
    ];
    const runs: readonly ChatHistoryRun[] = [
      {
        runId: 'run-1',
        sessionId: 'session-1',
        input: 'Which tables?',
        status: 'completed',
        createdAt: '2026-09-26T09:00:00.000Z',
        finishedAt: '2026-09-26T09:00:02.000Z',
        responseText: 'Two.',
        events: [
          {
            seq: 1,
            payload: {
              type: 'tool_started',
              data: {
                id: 'tool-1',
                name: 'mcp__trino__list_tables',
                arguments: { catalog: 'iceberg', schema: 'public' },
              },
            },
          },
          { seq: 2, payload: { type: 'tool_finished', data: { id: 'tool-1', success: true } } },
          {
            seq: 3,
            payload: {
              type: 'tool_result',
              data: { id: 'tool-1', is_error: false, content: '2 rows' },
            },
          },
        ],
      },
    ];

    const [, assistant] = hydrateChatRunHistory(messages, runs);

    expect(assistant?.toolActivity).toMatchObject([
      {
        id: 'tool-1',
        name: 'mcp__trino__list_tables',
        status: 'done',
        arguments: { catalog: 'iceberg', schema: 'public' },
      },
    ]);
  });

  /*
   * A reopened room rebuilds its messages from the transcript and stamps them
   * with the reload time, so every answer's footer said "now". The run knows
   * when the answer landed; a message that streamed live keeps its own clock.
   */
  it('dates a recovered answer by its run, not by the reload', () => {
    const run: ChatHistoryRun = {
      runId: 'run-1',
      sessionId: 'session-1',
      input: 'Which tables?',
      status: 'completed',
      createdAt: '2026-09-26T09:00:00.000Z',
      finishedAt: '2026-09-26T09:00:02.000Z',
      responseText: 'Two.',
      events: [],
    };
    const recovered: DisplayMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Two.',
      timestamp: '2026-09-27T15:21:00.000Z',
    };
    const live: DisplayMessage = { ...recovered, runId: 'run-1' };

    expect(hydrateChatRunHistory([recovered], [run])[0]?.timestamp).toBe(
      '2026-09-26T09:00:02.000Z',
    );
    expect(hydrateChatRunHistory([live], [run])[0]?.timestamp).toBe('2026-09-27T15:21:00.000Z');
  });
});

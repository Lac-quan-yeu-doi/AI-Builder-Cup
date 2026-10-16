import { describe, expect, it } from 'vitest';
import { mergeTranscriptMessages } from '@/app/_components/chat/chat-transcript-merge';

describe('mergeTranscriptMessages', () => {
  it('removes the legacy Skills-page instruction leak from persisted user text', () => {
    const leaked =
      'You are helping the user author reusable agent skills from the Skills page. ' +
      'Help them design, create, edit, or delete project skills using the skill tools. ' +
      'Call list_skills first to see what already exists and to match the house style.\n\n' +
      'create a data exploring skill for me';

    const messages = mergeTranscriptMessages({ id: 'session-1', messages: [] }, [
      { role: 'user', content: leaked, reasoning: null },
    ]);

    expect(messages[0]?.content).toBe('create a data exploring skill for me');
  });

  /*
   * The stored transcript is the model's raw conversation, so a run that
   * called a tool came back as three assistant entries: the sentence before
   * the call, an empty entry that only carried the call, and the answer. Each
   * rendered as its own message with its own copy and regenerate row.
   */
  it('folds the model turns of one run into one assistant message', () => {
    const messages = mergeTranscriptMessages({ id: 'session-1', messages: [] }, [
      { role: 'user', content: 'Which restaurant earns the most?', reasoning: null },
      { role: 'assistant', content: 'I will list the tables first.', reasoning: 'Look first.' },
      { role: 'assistant', content: '', reasoning: null },
      { role: 'assistant', content: 'Top 3 by revenue: A, B, C.', reasoning: 'Then sum.' },
      { role: 'user', content: 'Thanks.', reasoning: null },
      { role: 'assistant', content: 'Any time.', reasoning: null },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(messages[1]?.content).toBe(
      'I will list the tables first.\n\nTop 3 by revenue: A, B, C.',
    );
    expect(messages[1]?.reasoning).toBe('Look first.\n\nThen sum.');
    expect(messages[3]?.content).toBe('Any time.');
  });

  it('keeps a folded reply on the local message that streamed it', () => {
    const messages = mergeTranscriptMessages(
      {
        id: 'session-1',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'Which tables?',
            timestamp: '2026-09-27T09:00:00.000Z',
          },
          {
            id: 'a1',
            role: 'assistant',
            content: 'I will check.\n\nTwo tables.',
            timestamp: '2026-09-27T09:00:01.000Z',
            runId: 'run-1',
          },
        ],
      },
      [
        { role: 'user', content: 'Which tables?', reasoning: null },
        { role: 'assistant', content: 'I will check.', reasoning: null },
        { role: 'assistant', content: 'Two tables.', reasoning: null },
      ],
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: 'a1',
      runId: 'run-1',
      content: 'I will check.\n\nTwo tables.',
    });
  });
});

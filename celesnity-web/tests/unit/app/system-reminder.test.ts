import { describe, expect, it } from 'vitest';

import { parseSystemReminderContent } from '@/app/_components/chat/system-reminder';

describe('parseSystemReminderContent', () => {
  it('removes repeated multiline reminder blocks while preserving surrounding prose', () => {
    const result = parseSystemReminderContent(
      'Before.\n\n<system-reminder>\nfirst internal note\n</system-reminder>\n\nMiddle.\n<system-reminder>second internal note</system-reminder>\n\nAfter.',
    );

    expect(result).toEqual({
      content: 'Before.\n\nMiddle.\n\nAfter.',
      reminders: ['first internal note', 'second internal note'],
    });
  });

  it('strips an incomplete streaming reminder instead of exposing partial control text', () => {
    const result = parseSystemReminderContent('<system-reminder>\ninternal failure details');

    expect(result).toEqual({ content: '', reminders: ['internal failure details'] });
  });

  it('leaves ordinary Markdown untouched when no reminder is present', () => {
    expect(parseSystemReminderContent('# Revenue\n\n**Ready**.')).toEqual({
      content: '# Revenue\n\n**Ready**.',
      reminders: [],
    });
  });
});

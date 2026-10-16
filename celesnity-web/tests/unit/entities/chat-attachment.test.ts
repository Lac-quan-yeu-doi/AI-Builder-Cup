import { describe, expect, it } from 'vitest';

import {
  formatMessageWithAttachments,
  type ChatAttachment,
} from '@/src/entities/models/chat-attachment';

describe('formatMessageWithAttachments', () => {
  it('returns the text unchanged when there are no attachments', () => {
    expect(formatMessageWithAttachments('Explain this', [])).toBe('Explain this');
  });

  it('appends a single attachment as a plain-language note', () => {
    const attachments: readonly ChatAttachment[] = [
      { type: 'chart', id: 'chart-1', title: 'Revenue by region' },
    ];

    expect(formatMessageWithAttachments('Explain this', attachments)).toBe(
      'Explain this\n\n(Attached: chart "Revenue by region")',
    );
  });

  it('joins multiple attachments in order', () => {
    const attachments: readonly ChatAttachment[] = [
      { type: 'chart', id: 'chart-1', title: 'Revenue by region' },
      { type: 'chart', id: 'chart-2', title: 'Units by region' },
    ];

    expect(formatMessageWithAttachments('Compare these', attachments)).toBe(
      'Compare these\n\n(Attached: chart "Revenue by region", chart "Units by region")',
    );
  });
});

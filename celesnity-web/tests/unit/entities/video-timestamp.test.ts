import { expect, it } from 'vitest';

import { formatTimestamp, splitTimestamps } from '@/src/entities/models/video-timestamp';

it('formats seconds as m:ss', () => {
  expect(formatTimestamp(0)).toBe('0:00');
  expect(formatTimestamp(75.4)).toBe('1:15');
});

it('finds timestamps inside a question', () => {
  expect(splitTimestamps('Is the machine at 1:12 a dryer?')).toEqual([
    { text: 'Is the machine at ' },
    { seconds: 72, label: '1:12' },
    { text: ' a dryer?' },
  ]);
});

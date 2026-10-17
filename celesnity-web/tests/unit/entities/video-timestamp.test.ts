import { describe, expect, it } from 'vitest';

import {
  clockDigitsFix,
  formatTimestamp,
  splitTimestamps,
} from '@/src/entities/models/video-timestamp';

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

describe('clockDigitsFix', () => {
  it('reads values past the end of the video as m:ss digits', () => {
    const fix = clockDigitsFix([23, 43, 718, 737, 743], 463.7);
    expect(fix?.(743)).toBe(463);
    expect(fix?.(118)).toBe(78);
    expect(fix?.(23)).toBe(23);
  });

  it('leaves times alone when they fit the video or cannot be clock digits', () => {
    expect(clockDigitsFix([12, 40, 120], 300)).toBeUndefined();
    expect(clockDigitsFix([12, 395], 300)).toBeUndefined();
  });
});

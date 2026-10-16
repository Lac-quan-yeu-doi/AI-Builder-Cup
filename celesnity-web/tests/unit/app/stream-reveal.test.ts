// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HOLD_PARTIAL_WORD_MS,
  REVEAL_FRAMES,
  REVEAL_TICK_MS,
  revealMore,
  SETTLE_MS,
} from '@/app/_components/chat/stream-reveal';
import { useSmoothStream } from '@/app/_components/chat/use-smooth-stream';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* One reveal tick. React applies the state a tick set only when the `act`
   scope closes, so each tick is its own `act`. */
function ticks(count: number): void {
  for (let tick = 0; tick < count; tick += 1) act(() => vi.advanceTimersByTime(REVEAL_TICK_MS));
}

describe('revealMore', () => {
  it('lets out one whole word, with the space after it, per call', () => {
    const content = 'Revenue is up 4% ';
    expect(revealMore(content, 0, true)).toBe('Revenue '.length);
    expect(revealMore(content, 'Revenue '.length, true)).toBe('Revenue is '.length);
  });

  it('holds a half-written last word back only while chunks are still arriving', () => {
    const content = 'Revenue is up 4% quar';
    const shown = 'Revenue is up 4% '.length;
    // Arriving: the word would reflow the line on every token.
    expect(revealMore(content, 'Revenue is up '.length, true, true)).toBe(shown);
    expect(revealMore(content, shown, true, true)).toBe(shown);
    // Paused (thinking, tools) or closed: let it out as far as it has come.
    expect(revealMore(content, shown, true, false)).toBe(content.length);
    expect(revealMore(content, shown, false, true)).toBe(content.length);
    expect(revealMore(content, content.length, true, true)).toBe(content.length);
  });

  it('speeds up with the backlog so the shown text stays close behind', () => {
    const words = Array.from({ length: 10 * REVEAL_FRAMES }, (_, i) => `w${i}`);
    const content = words.join(' ') + ' ';
    // Ten words at once with 120 waiting …
    expect(revealMore(content, 0, true)).toBe(words.slice(0, 10).join(' ').length + 1);
    // … and still one when only one is.
    const last = content.length - 'w119 '.length;
    expect(revealMore(content, last, true)).toBe(content.length);
  });

  /* `**Kết` shown alone renders as literal asterisks, then snaps to bold when
     `luận**` arrives — a flicker at every bold phrase. */
  it('never cuts a bold, code or link span in two while streaming', () => {
    const bold = 'Xem **kết luận chính** ở đây';
    // The closer has arrived: run on past it.
    expect(revealMore(bold, 'Xem '.length, true)).toBe('Xem **kết luận chính** '.length);
    // The closer has not: wait just before the opener.
    const open = 'Xem **kết luận';
    expect(revealMore(open, 'Xem '.length, true)).toBe('Xem '.length);
    expect(revealMore(open, 'Xem '.length, false)).toBe('Xem **kết '.length);
    // Code and links alike.
    expect(revealMore('Run `SELECT 1` now', 'Run '.length, true)).toBe('Run `SELECT 1` '.length);
    expect(revealMore('See [the chart](citation://c/1) here', 'See '.length, true)).toBe(
      'See [the chart](citation://c/1) '.length,
    );
    expect(revealMore('See [the chart', 'See '.length, true)).toBe('See '.length);
  });

  /* A half-arrived `<suggestion>` renders as its inner text, then vanishes
     when the closer lands and the tag is swapped for a row. */
  it("holds the agent's own tags whole until they close", () => {
    const open = 'Done.\n\n<suggestion>Break this down by';
    expect(revealMore(open, 'Done.\n\n'.length, true)).toBe('Done.\n\n'.length);
    const closed = 'Done.\n\n<suggestion>Break this down by region</suggestion> ';
    expect(revealMore(closed, 'Done.\n\n'.length, true)).toBe(closed.length);
  });

  it('gives up waiting on an opener that is far behind the text', () => {
    const stray = 'A lone ** ' + 'x'.repeat(90);
    expect(revealMore(stray, 'A lone '.length, true)).toBe('A lone ** '.length);
  });
});

describe('useSmoothStream', () => {
  it('shows a settled message whole at once', () => {
    const { result } = renderHook(() => useSmoothStream('All of it.', false));
    expect(result.current).toEqual({ text: 'All of it.', settled: 'All of it.'.length });
  });

  it('lets a streaming message out a word per tick and drains the rest when it closes', () => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
        'performance',
      ],
    });
    const { result, rerender } = renderHook(
      ({ content, streaming }) => useSmoothStream(content, streaming),
      { initialProps: { content: 'Revenue is up 4% quar', streaming: true } },
    );
    expect(result.current.text).toBe('');

    ticks(1);
    expect(result.current.text).toBe('Revenue ');
    ticks(1);
    expect(result.current.text).toBe('Revenue is ');
    // The half-written word waits while chunks are still arriving …
    ticks(3);
    expect(result.current.text).toBe('Revenue is up 4% ');
    // … and comes out once they pause.
    ticks(Math.ceil(HOLD_PARTIAL_WORD_MS / REVEAL_TICK_MS) + 1);
    expect(result.current.text).toBe('Revenue is up 4% quar');

    rerender({ content: 'Revenue is up 4% quarter over quarter.', streaming: false });
    ticks(3);
    expect(result.current.text).toBe('Revenue is up 4% quarter over quarter.');
  });

  it('settles a word a fade after it was revealed, and everything once the stream is done', () => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
        'performance',
      ],
    });
    const { result } = renderHook(() => useSmoothStream('Revenue is up 4% ', true));
    ticks(2);
    expect(result.current).toEqual({ text: 'Revenue is ', settled: 0 });

    // A settle window after the first word came out it has settled; the
    // second has not.
    ticks(Math.ceil(SETTLE_MS / REVEAL_TICK_MS) - 1);
    expect(result.current.text).toBe('Revenue is up 4% ');
    expect(result.current.settled).toBe('Revenue '.length);

    ticks(Math.ceil(SETTLE_MS / REVEAL_TICK_MS) + 1);
    expect(result.current.settled).toBe('Revenue is up 4% '.length);
  });
});

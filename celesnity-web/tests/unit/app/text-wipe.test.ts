// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TextWipe, WIPE_CURSOR, WIPE_MS_PER_CHAR } from '@/app/_components/ui/text-wipe';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* One cursor step per `act`: React applies the state a timer set only when
   the `act` scope closes, so advancing further inside one fires nothing. */
function steps(count: number): void {
  for (let step = 0; step < count; step += 1) act(() => vi.advanceTimersByTime(WIPE_MS_PER_CHAR));
}

describe('TextWipe', () => {
  it('rests as plain text, with no cursor', () => {
    const { container } = render(createElement(TextWipe, { text: 'Shimmying…' }));
    expect(container.textContent).toBe('Shimmying…');
  });

  it('sweeps a cursor across the line, turning each character it passes into the new text', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(createElement(TextWipe, { text: 'Shimmying…' }));
    rerender(createElement(TextWipe, { text: 'Scheming…' }));
    // Cursor at 0: nothing of the new text yet, the old text past the cursor.
    expect(container.textContent).toBe(`${WIPE_CURSOR}himmying…`);

    steps(6);
    expect(container.textContent).toBe(`Schemi${WIPE_CURSOR}ng…`);
    expect(container.firstElementChild?.getAttribute('aria-label')).toBe('Scheming…');

    // Past the end the cursor is gone.
    steps(10);
    expect(container.textContent).toBe('Scheming…');
  });

  it('retargets a wipe in progress instead of restarting it', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(createElement(TextWipe, { text: 'Shimmying…' }));
    rerender(createElement(TextWipe, { text: 'Scheming…' }));
    steps(3);
    rerender(createElement(TextWipe, { text: 'Manifesting…' }));
    expect(container.textContent).toBe(`Man${WIPE_CURSOR}mying…`);

    steps(20);
    expect(container.textContent).toBe('Manifesting…');
  });
});

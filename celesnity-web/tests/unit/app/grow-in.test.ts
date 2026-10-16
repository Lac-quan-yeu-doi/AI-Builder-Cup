// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrowIn } from '@/app/_components/ui/grow-in';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GrowIn', () => {
  it('starts closed, opens on the next frame and lifts its clip once grown', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const { container } = render(createElement(GrowIn, { active: true }, 'row'));
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.firstElementChild as HTMLElement;
    expect(outer.className).toContain('motion-safe:grid-rows-[0fr]');
    expect(inner.className).toContain('motion-safe:overflow-hidden');

    act(() => vi.advanceTimersByTime(16));
    expect(outer.className).toContain('grid-rows-[1fr]');
    expect(inner.className).toContain('motion-safe:overflow-hidden');

    fireEvent.transitionEnd(outer);
    expect(inner.className).not.toContain('overflow-hidden');
  });

  it('appears at once when not active', () => {
    const { container } = render(createElement(GrowIn, { active: false }, 'row'));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('grid-rows-[1fr]');
    expect((outer.firstElementChild as HTMLElement).className).not.toContain('overflow-hidden');
  });
});

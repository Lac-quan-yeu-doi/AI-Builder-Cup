// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThinkingOrb } from '@/app/_components/ui/thinking-orb';

afterEach(cleanup);

describe('ThinkingOrb', () => {
  it('is an image of the state, named for assistive technology', () => {
    render(createElement(ThinkingOrb, { label: 'Thinking…', state: 'searching' }));

    const orb = screen.getByRole('img', { name: 'Thinking…' });
    expect(orb.tagName).toBe('CANVAS');
  });

  it('keeps its size and passes layout classes through', () => {
    const { container } = render(
      createElement(ThinkingOrb, { className: 'ml-2', label: 'Reconnecting…', size: 32 }),
    );

    const orb = container.querySelector('canvas');
    expect(orb?.className).toContain('shrink-0');
    expect(orb?.className).toContain('ml-2');
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ShimmerText } from '@/app/_components/ui/shimmer-text';

afterEach(cleanup);

describe('ShimmerText', () => {
  it('cuts the text out of a sliding gradient, only when motion is welcome', () => {
    render(createElement(ShimmerText, { className: 'text-caption' }, 'Searching…'));

    const text = screen.getByText('Searching…');
    expect(text.className).toContain('motion-safe:animate-text-sheen');
    expect(text.className).toContain('motion-safe:bg-clip-text');
    expect(text.className).toContain('motion-safe:text-transparent');
    expect(text.className).toContain('text-caption');
  });

  it('lets the caller shine a different colour and passes attributes through', () => {
    render(
      createElement(
        ShimmerText,
        { className: 'motion-safe:from-foreground', id: 'thinking-title' },
        'Thinking…',
      ),
    );

    const text = screen.getByText('Thinking…');
    expect(text.id).toBe('thinking-title');
    expect(text.className).toContain('motion-safe:from-foreground');
    expect(text.className).not.toContain('motion-safe:from-muted-foreground');
  });
});

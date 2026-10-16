// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatSuggestions } from '@/app/_components/chat/chat-suggestions';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('ChatSuggestions', () => {
  it('sends the suggestion it was clicked on, under its own heading', () => {
    const onSelect = vi.fn();
    render(
      createElement(ChatSuggestions, { suggestions: ['Break this down by region'], onSelect }),
    );

    expect(screen.getByText('Ask more about this')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Break this down by region' }));
    expect(onSelect).toHaveBeenCalledWith('Break this down by region');
  });

  /* The rows are laid out before the reply is done, so nothing shifts when
     they go live; until then they do nothing. */
  it('shows the rows without a handler, but they do nothing', () => {
    render(createElement(ChatSuggestions, { suggestions: ['One'] }));
    const row = screen.getByRole('button', { name: 'One' });
    expect(row.hasAttribute('disabled')).toBe(true);
    expect(row.className).not.toContain('cursor-pointer');
  });

  it('leaves the heading out when the prose already ends on a lead-in', () => {
    render(createElement(ChatSuggestions, { suggestions: ['One'], heading: false }));
    expect(screen.queryByText('Ask more about this')).toBeNull();
  });

  it('offers at most three, however many the agent emitted', () => {
    const { container } = render(
      createElement(ChatSuggestions, {
        suggestions: ['One', 'Two', 'Three', 'Four', 'Five'],
        onSelect: vi.fn(),
      }),
    );
    expect(container.querySelectorAll('button')).toHaveLength(3);
  });

  /* Blue is a link, the focus ring or the row you are on: a stack of blue
     controls under an answer would read as options already chosen. */
  it('reads as an action rather than as a selection', () => {
    const { container } = render(
      createElement(ChatSuggestions, { suggestions: ['One', 'Two'], onSelect: vi.fn() }),
    );
    for (const row of container.querySelectorAll('button')) {
      expect(row.className).not.toMatch(/(?:^|\s)(?:bg-accent|text-primary|border-primary)/u);
      expect(row.className).toContain('border-border');
    }
  });

  it('renders nothing when the answer suggested nothing', () => {
    const { container } = render(createElement(ChatSuggestions, { suggestions: [] }));
    expect(container.firstChild).toBeNull();
  });
});

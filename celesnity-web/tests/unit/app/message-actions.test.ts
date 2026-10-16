// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageActions } from '@/app/_components/chat/message-actions';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessageActions', () => {
  it('copies the prose the reader saw, without the suggestion tags', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      createElement(MessageActions, {
        content: 'Revenue grew 8%.\n\n<suggestion>Break this down by region</suggestion>',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy answer' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Revenue grew 8%.'));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('regenerates when asked, and only then', () => {
    const onRegenerate = vi.fn();
    const { rerender } = render(createElement(MessageActions, { content: 'A.', onRegenerate }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate answer' }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(createElement(MessageActions, { content: 'A.' }));
    expect(screen.getByRole('button', { name: 'Regenerate answer' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  /* Share and the ratings hold their place in the row, and say they are not
     there yet rather than doing nothing silently. */
  it('keeps the actions that are not wired yet in place, disabled', () => {
    render(createElement(MessageActions, { content: 'A.' }));
    for (const name of [
      'Share (coming soon)',
      'Good answer (coming soon)',
      'Poor answer (coming soon)',
    ])
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
  });
});

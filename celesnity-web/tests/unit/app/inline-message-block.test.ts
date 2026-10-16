// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineMessageBlock } from '@/app/_components/chat/inline-message-block';
import { renderUi } from '@/tests/support/render-ui';
import type { MessageBlock } from '@/app/_components/chat/types';

afterEach(() => {
  cleanup();
});

function textBlock(text: string): MessageBlock {
  return {
    id: 'block-1',
    runId: null,
    blockType: 'text',
    payload: { text },
    fallbackText: text,
  };
}

function markdownBlock(content: string): MessageBlock {
  return {
    id: 'block-1',
    runId: null,
    blockType: 'markdown',
    payload: { content },
    fallbackText: content,
  };
}

describe('InlineMessageBlock text/markdown suggestion rendering', () => {
  it("renders a text block's suggestion tags as chips and strips them from the prose, when onSuggestionSelect is given", () => {
    renderUi(
      createElement(InlineMessageBlock, {
        block: textBlock('Revenue grew 8%. <suggestion>Break this down by region</suggestion>'),
        onSuggestionSelect: vi.fn(),
      }),
    );

    expect(screen.getByText('Revenue grew 8%.', { exact: false })).toBeDefined();
    expect(screen.queryByText(/<suggestion>/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Break this down by region' })).toBeDefined();
  });

  it('calls onSuggestionSelect with the chip text when a text block chip is clicked', () => {
    const onSuggestionSelect = vi.fn();
    renderUi(
      createElement(InlineMessageBlock, {
        block: textBlock('<suggestion>Break this down by region</suggestion>'),
        onSuggestionSelect,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Break this down by region' }));

    expect(onSuggestionSelect).toHaveBeenCalledWith('Break this down by region');
  });

  it('renders no chips for a text block when onSuggestionSelect is omitted, but still strips the tags', () => {
    renderUi(
      createElement(InlineMessageBlock, {
        block: textBlock('Revenue grew 8%. <suggestion>Break this down by region</suggestion>'),
      }),
    );

    expect(screen.queryByRole('button', { name: 'Break this down by region' })).toBeNull();
    // This assertion previously required the opposite — that the raw tag be
    // shown — which is how a reply came to sprout literal `<suggestion>`
    // markup as soon as a newer message took away its chips.
    expect(document.body.textContent).not.toContain('<suggestion>');
    expect(screen.getByText(/Revenue grew 8%/)).toBeTruthy();
  });

  it("renders a markdown block's suggestion tags as chips and strips them from the prose, when onSuggestionSelect is given", () => {
    renderUi(
      createElement(InlineMessageBlock, {
        block: markdownBlock('Revenue grew 8%. <suggestion>Compare to last quarter</suggestion>'),
        onSuggestionSelect: vi.fn(),
      }),
    );

    expect(screen.queryByText(/<suggestion>/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Compare to last quarter' })).toBeDefined();
  });

  it('renders a file block as a compact attachment row', () => {
    renderUi(
      createElement(InlineMessageBlock, {
        block: {
          id: 'file-1',
          runId: 'run-1',
          blockType: 'file',
          payload: { filename: 'orders.pdf', mimeType: 'application/pdf', size: 2048 },
          fallbackText: 'orders.pdf',
        },
      }),
    );

    expect(screen.getByText('orders.pdf')).toBeDefined();
    expect(screen.getByText('application/pdf · 2 KB')).toBeDefined();
  });
});

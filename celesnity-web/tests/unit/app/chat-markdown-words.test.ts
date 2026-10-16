// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatMarkdown } from '@/app/_components/chat/chat-markdown';
import { rehypeWords } from '@/app/_components/chat/rehype-words';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const FADING = 'motion-safe:animate-token-in';

function words(container: HTMLElement): [string, boolean][] {
  return [...container.querySelectorAll('p > span')].map((span) => [
    span.textContent ?? '',
    span.className.includes(FADING),
  ]);
}

describe('rehypeWords', () => {
  it('wraps each word in a span keyed by its source offset and leaves code whole', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Up 4%  today', position: { start: { offset: 10 } } }],
        },
        {
          type: 'element',
          tagName: 'code',
          children: [{ type: 'text', value: 'SELECT 1', position: { start: { offset: 30 } } }],
        },
      ],
    };

    rehypeWords()(tree);

    expect(tree.children[0]?.children).toEqual([
      {
        type: 'element',
        tagName: 'span',
        properties: { dataToken: 10 },
        children: [{ type: 'text', value: 'Up' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'element',
        tagName: 'span',
        properties: { dataToken: 13 },
        children: [{ type: 'text', value: '4%' }],
      },
      { type: 'text', value: '  ' },
      {
        type: 'element',
        tagName: 'span',
        properties: { dataToken: 17 },
        children: [{ type: 'text', value: 'today' }],
      },
    ]);
    expect(tree.children[1]?.children).toEqual([
      { type: 'text', value: 'SELECT 1', position: { start: { offset: 30 } } },
    ]);
  });
});

describe('ChatMarkdown animateFrom', () => {
  /* Every re-render re-parses the markdown. Without the offsets, a word that
     had been on screen for a while would fade in again with each chunk. */
  it('fades in only the words from the given offset on', () => {
    const { container, rerender } = renderUi(
      createElement(ChatMarkdown, { content: 'Revenue is up', animateFrom: 0 }),
    );
    expect(words(container)).toEqual([
      ['Revenue', true],
      ['is', true],
      ['up', true],
    ]);

    rerender(createElement(ChatMarkdown, { content: 'Revenue is up 4%', animateFrom: 11 }));
    expect(words(container)).toEqual([
      ['Revenue', false],
      ['is', false],
      ['up', true],
      ['4%', true],
    ]);
  });

  it('keeps one word element across re-renders, so its fade never restarts', () => {
    const { container, rerender } = renderUi(
      createElement(ChatMarkdown, { content: 'Revenue is', animateFrom: 0 }),
    );
    const first = container.querySelector('p > span');
    rerender(createElement(ChatMarkdown, { content: 'Revenue is up', animateFrom: 8 }));
    expect(container.querySelector('p > span')).toBe(first);
  });

  it('renders settled prose plain, with no per-word spans', () => {
    const { container } = renderUi(createElement(ChatMarkdown, { content: 'Revenue is up' }));
    expect(container.querySelector('p')?.innerHTML).toBe('Revenue is up');
  });

  /* A streaming message is rendered block by block so settled blocks are not
     re-parsed per tick. The seams must not show: no wrappers, so block
     margins read across them; and a block settling must leave the blocks
     after it alone — rebuilding them faded their words in a second time. */
  it('keeps every block, and the words still fading, in place as earlier blocks settle', () => {
    const content = 'One two.\n\n## Three\n\nFour five';
    const { container, rerender } = renderUi(
      createElement(ChatMarkdown, { content, animateFrom: 0 }),
    );
    const root = container.querySelector('[data-slot="chat-markdown"]');
    expect([...(root?.children ?? [])].map((el) => el.tagName)).toEqual(['P', 'H2', 'P']);
    expect(container.querySelector('h2')?.className).toContain('mt-3');
    const first = container.querySelector('p');
    const spanFor = (word: string) =>
      [...container.querySelectorAll('p > span')].find((span) => span.textContent === word);
    const fading = spanFor('Four');
    expect(fading?.className).toContain(FADING);

    // The first two blocks settle while the last still fades.
    rerender(
      createElement(ChatMarkdown, { content, animateFrom: 'One two.\n\n## Three\n\n'.length }),
    );
    expect(container.querySelector('p')).toBe(first);
    expect(first?.querySelector('span')).toBeNull();
    expect(spanFor('Four')).toBe(fading);

    // Settled entirely: the same elements, no per-word spans left.
    rerender(createElement(ChatMarkdown, { content }));
    expect(container.querySelector('p')).toBe(first);
    expect(container.querySelectorAll('p > span')).toHaveLength(0);
  });
});

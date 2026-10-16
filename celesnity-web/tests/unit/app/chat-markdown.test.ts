// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatMarkdown } from '@/app/_components/chat/chat-markdown';
import { renderUi } from '@/tests/support/render-ui';
import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';

afterEach(() => {
  cleanup();
});

describe('ChatMarkdown citations', () => {
  it('renders a numbered muted bubble while a citation is unresolved', () => {
    renderUi(
      createElement(ChatMarkdown, {
        content: 'Revenue is up <citation><type>chart</type><id>chart-1</id></citation>.',
      }),
    );

    expect(screen.getByText('1')).toBeDefined();
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });

  it('renders a clickable bubble with the title tooltip once resolved and found', () => {
    const resolved: Record<string, ResolvedCitationViewModel> = {
      'chart:chart-1:': { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
    };
    const onCitationClick = vi.fn();

    renderUi(
      createElement(ChatMarkdown, {
        content: 'See <citation><type>chart</type><id>chart-1</id></citation>.',
        resolvedCitations: resolved,
        onCitationClick,
      }),
    );

    const button = screen.getByRole('button', { name: '1' });
    fireEvent.click(button);
    expect(onCitationClick).toHaveBeenCalledWith(resolved['chart:chart-1:']);
  });

  it('renders a muted, non-interactive bubble when found is false', () => {
    const resolved: Record<string, ResolvedCitationViewModel> = {
      'chart:stale:': { type: 'chart', id: 'stale', found: false, title: null },
    };

    renderUi(
      createElement(ChatMarkdown, {
        content: '<citation><type>chart</type><id>stale</id></citation>',
        resolvedCitations: resolved,
      }),
    );

    expect(screen.getByText('1')).toBeDefined();
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });

  it('numbers repeated citations of the same reference identically', () => {
    const content =
      '<citation><type>chart</type><id>chart-1</id></citation> and again ' +
      '<citation><type>chart</type><id>chart-1</id></citation> plus a new one ' +
      '<citation><type>chart</type><id>chart-2</id></citation>';

    renderUi(createElement(ChatMarkdown, { content }));

    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders plain markdown untouched when there are no citations', () => {
    renderUi(createElement(ChatMarkdown, { content: 'Just **bold** text.' }));
    expect(screen.getByText('bold')).toBeDefined();
  });
});

describe('ChatMarkdown sources footer', () => {
  it('renders no Sources toggle when the message has no citations', () => {
    renderUi(createElement(ChatMarkdown, { content: 'Just **bold** text.' }));
    expect(screen.queryByRole('button', { name: /Sources/ })).toBeNull();
  });

  it('shows a collapsed Sources toggle with a count, expanding to list resolved titles', () => {
    const resolved: Record<string, ResolvedCitationViewModel> = {
      'chart:chart-1:': { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
      'document:doc-1:4': {
        type: 'document',
        id: 'doc-1',
        found: true,
        title: 'Board deck',
        page: 4,
      },
    };

    renderUi(
      createElement(ChatMarkdown, {
        content:
          'Revenue grew <citation><type>chart</type><id>chart-1</id></citation>, per ' +
          '<citation><type>document</type><id>doc-1</id><page>4</page></citation>.',
        resolvedCitations: resolved,
      }),
    );

    const toggle = screen.getByRole('button', { name: 'Sources (2)' });
    expect(screen.queryByText(/Revenue by region/)).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByText(/Revenue by region/)).toBeDefined();
    expect(screen.getByText(/Board deck/)).toBeDefined();
    expect(screen.getByText(/p\. 4/)).toBeDefined();
  });

  it('clicking a resolved source row triggers onCitationClick, same as its inline bubble', () => {
    const resolved: Record<string, ResolvedCitationViewModel> = {
      'chart:chart-1:': { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
    };
    const onCitationClick = vi.fn();

    renderUi(
      createElement(ChatMarkdown, {
        content: 'Revenue grew <citation><type>chart</type><id>chart-1</id></citation>.',
        resolvedCitations: resolved,
        onCitationClick,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sources (1)' }));
    fireEvent.click(screen.getByRole('button', { name: /Revenue by region/ }));

    expect(onCitationClick).toHaveBeenCalledWith(resolved['chart:chart-1:']);
  });

  it('labels an unresolved or not-found source as unavailable', () => {
    renderUi(
      createElement(ChatMarkdown, {
        content: '<citation><type>chart</type><id>chart-1</id></citation>',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sources (1)' }));
    expect(screen.getByText('This reference is no longer available.')).toBeDefined();
  });
});

describe('ChatMarkdown rich content', () => {
  it('renders a GFM table with header and body cells', () => {
    const content = ['| Region | Revenue |', '| --- | --- |', '| West | 12 |', '| East | 9 |'].join(
      '\n',
    );
    renderUi(createElement(ChatMarkdown, { content }));

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Region' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'West' })).toBeDefined();
    expect(screen.getByRole('cell', { name: '9' })).toBeDefined();
  });

  it('renders headings at every level', () => {
    renderUi(createElement(ChatMarkdown, { content: '# Title\n\n## Section\n\n### Sub' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Sub' })).toBeDefined();
  });

  it('renders a GFM task list with checked/unchecked checkboxes', () => {
    renderUi(createElement(ChatMarkdown, { content: '- [x] Done\n- [ ] Todo' }));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(false);
  });

  it('shows the fenced code block language and copies its text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderUi(createElement(ChatMarkdown, { content: '```ts\nconst x = 1;\n```' }));

    expect(screen.getByText('ts')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledWith('const x = 1;\n');
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { InlineReasoning } from '@/app/_components/chat/inline-reasoning';
import type { ToolActivity } from '@/app/_components/chat/types';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

function tool(id: string, status: ToolActivity['status'] = 'done'): ToolActivity {
  return { id, name: 'list_tables', status };
}

describe('InlineReasoning', () => {
  /* It used to read "View reasoning 1" — a bare number in a pill, next to the
     one thing it did not say, which is what it was counting. */
  it('names the unit the count is in', () => {
    render(createElement(InlineReasoning, { toolActivity: [tool('a'), tool('b'), tool('c')] }));
    expect(screen.getByRole('button', { name: /View reasoning · 3 steps/u })).toBeTruthy();
  });

  it('says one step in the singular', () => {
    render(createElement(InlineReasoning, { toolActivity: [tool('a')] }));
    expect(screen.getByRole('button', { name: /View reasoning · 1 step/u })).toBeTruthy();
  });

  it('counts nothing when there is only reasoning to read', () => {
    render(
      createElement(InlineReasoning, { reasoning: 'Checked the orders table.', toolActivity: [] }),
    );
    expect(screen.getByRole('button', { name: 'View reasoning' })).toBeTruthy();
  });

  /* A disclosure toggle is not a link. Blue carries links, focus and selection
     in this skin, and a column of blue toggles pulls harder than the answers
     they sit above. */
  it('reads as a disclosure control rather than a link', () => {
    const { container } = render(createElement(InlineReasoning, { toolActivity: [tool('a')] }));
    const toggle = container.querySelector('button');
    expect(toggle?.className).toContain('text-muted-foreground');
    expect(toggle?.className).not.toMatch(/text-primary/u);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the tool chain and distinguishes a step still running from one that finished', () => {
    const { container } = render(
      createElement(InlineReasoning, { toolActivity: [tool('a', 'running'), tool('b', 'done')] }),
    );

    fireEvent.click(screen.getByRole('button', { name: /View reasoning/u }));

    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    const marks = [...container.querySelectorAll('[data-tool-status]')].map((node) =>
      node.getAttribute('data-tool-status'),
    );
    expect(marks).toEqual(['running', 'done']);
  });

  /* The row used to print the wire name with its underscores swapped for
     spaces — "List tables  trino" — which told a person which function ran,
     not what the agent was doing. */
  it('reads each tool call as a step, with the thing it acted on', () => {
    render(
      createElement(InlineReasoning, {
        toolActivity: [
          {
            id: 'a',
            name: 'mcp__trino__list_tables',
            status: 'done',
            arguments: { catalog: 'iceberg', schema: 'public' },
          },
          { id: 'b', name: 'parse_spreadsheet', status: 'failed' },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /View reasoning/u }));

    const listing = screen.getByTitle('mcp__trino__list_tables');
    expect(listing.textContent).toBe('Listing tables: iceberg.public');
    expect(screen.queryByText(/mcp__/u)).toBeNull();
    expect(screen.getByTitle('parse_spreadsheet').textContent).toBe(
      'Using tool: Parse spreadsheet',
    );
  });

  it('renders nothing when the turn had neither reasoning nor tools', () => {
    const { container } = render(createElement(InlineReasoning, { toolActivity: [] }));
    expect(container.querySelector('button')).toBeNull();
  });
});

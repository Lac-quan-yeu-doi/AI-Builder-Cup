// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { THINKING_PHASE_MS, ThinkingStatus } from '@/app/_components/chat/thinking-status';
import { WIPE_MS_PER_CHAR } from '@/app/_components/ui/text-wipe';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function phase(): string | null {
  return (
    document.querySelector('[data-thinking-phase]')?.getAttribute('data-thinking-phase') ?? null
  );
}

describe('ThinkingStatus', () => {
  /* One orb and one word for a wait of any length read as a stalled spinner. */
  it('walks the orb and its caption through the phases while nothing is known', () => {
    vi.useFakeTimers();
    render(createElement(ThinkingStatus));

    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(phase()).toBe('working');
    expect(screen.getByText('Getting started…')).toBeTruthy();

    act(() => vi.advanceTimersByTime(THINKING_PHASE_MS));
    expect(phase()).toBe('searching');
    // The new caption is wiped in character by character, one step per `act`.
    for (let step = 0; step < 40; step += 1) act(() => vi.advanceTimersByTime(WIPE_MS_PER_CHAR));
    expect(screen.getByText('Looking through your data…')).toBeTruthy();

    act(() => vi.advanceTimersByTime(THINKING_PHASE_MS * 4));
    expect(phase()).toBe('working');
  });

  it('follows the tool that is running instead of guessing', () => {
    vi.useFakeTimers();
    render(
      createElement(ThinkingStatus, {
        tools: [
          { id: 'a', name: 'mcp__trino__list_catalogs', status: 'done' },
          {
            id: 'b',
            name: 'mcp__trino__run_query',
            status: 'running',
            arguments: { sql: 'SELECT 1' },
          },
        ],
      }),
    );

    expect(phase()).toBe('searching');
    expect(screen.getByText('Running SQL query: SELECT 1')).toBeTruthy();

    act(() => vi.advanceTimersByTime(THINKING_PHASE_MS * 2));
    expect(phase()).toBe('searching');
  });

  it('lists the finished calls as steps and keeps the running one on the card', () => {
    render(
      createElement(ThinkingStatus, {
        tools: [
          {
            id: 'a',
            name: 'mcp__trino__list_tables',
            status: 'failed',
            arguments: { catalog: 'iceberg', schema: 'demo' },
          },
          { id: 'b', name: 'publish_message_block', status: 'done' },
          { id: 'c', name: 'mcp__trino__describe_table', status: 'running' },
        ],
      }),
    );

    const marks = [...document.querySelectorAll('[data-tool-status]')].map((mark) =>
      mark.getAttribute('data-tool-status'),
    );
    expect(marks).toEqual(['failed']);
    expect(screen.getByText('Reading table structure')).toBeTruthy();
    expect(screen.getByTitle('mcp__trino__list_tables').textContent).toBe(
      'Listing tables: iceberg.demo',
    );
    expect(screen.queryByTitle('publish_message_block')).toBeNull();
  });

  it('leaves the finished steps out when asked to', () => {
    render(
      createElement(ThinkingStatus, {
        steps: false,
        tools: [
          { id: 'a', name: 'mcp__trino__list_tables', status: 'done' },
          { id: 'b', name: 'mcp__trino__describe_table', status: 'running' },
        ],
      }),
    );

    expect(screen.getByText('Reading table structure')).toBeTruthy();
    expect(screen.queryByTitle('mcp__trino__list_tables')).toBeNull();
    expect(document.querySelectorAll('[data-tool-status]')).toHaveLength(0);
  });
});

describe('ThinkingStatus elapsed time', () => {
  /*
   * A query that takes twenty seconds used to look the same at second one and
   * second twenty. The caption now says how long the step has run, so a slow
   * step reads as slow rather than stuck, and starts over for the next tool.
   */
  it('counts the seconds a step has run and starts over for the next tool', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      createElement(ThinkingStatus, {
        tools: [
          {
            id: 'a',
            name: 'mcp__chart__preview_chart',
            status: 'running',
            arguments: { title: 'Revenue' },
          },
        ],
      }),
    );

    expect(document.querySelector('[data-thinking-elapsed]')).toBeNull();
    act(() => vi.advanceTimersByTime(3_000));
    expect(document.querySelector('[data-thinking-elapsed]')?.textContent).toBe('· 3s');

    rerender(
      createElement(ThinkingStatus, {
        tools: [
          { id: 'a', name: 'mcp__chart__preview_chart', status: 'done' },
          {
            id: 'b',
            name: 'mcp__trino__run_query',
            status: 'running',
            arguments: { sql: 'SELECT 1' },
          },
        ],
      }),
    );
    expect(document.querySelector('[data-thinking-elapsed]')).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(document.querySelector('[data-thinking-elapsed]')?.textContent).toBe('· 1s');
  });

  /* The card sits in a polite live region; a number that changed every second
     would be read out every second. */
  it('keeps the counter out of the live region', () => {
    vi.useFakeTimers();
    render(createElement(ThinkingStatus));
    act(() => vi.advanceTimersByTime(2_000));
    expect(document.querySelector('[data-thinking-elapsed]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

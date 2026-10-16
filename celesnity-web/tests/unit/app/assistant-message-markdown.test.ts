// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessageMarkdown } from '@/app/_components/chat/assistant-message-markdown';
import { renderUi } from '@/tests/support/render-ui';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';

afterEach(() => {
  cleanup();
});

describe('AssistantMessageMarkdown', () => {
  it('resolves citations once the message has settled and lifts the result up', async () => {
    const resolveCitations = vi.fn(async () => [
      { type: 'chart' as const, id: 'chart-1', found: true, title: 'Revenue by region' },
    ]) as unknown as ResolveCitationsController;
    const onResolved = vi.fn();

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'See <citation><type>chart</type><id>chart-1</id></citation>.',
        active: false,
        resolveCitations,
        onResolved,
      }),
    );

    await waitFor(() =>
      expect(resolveCitations).toHaveBeenCalledWith([{ type: 'chart', id: 'chart-1' }]),
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({
        'chart:chart-1:': { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
      }),
    );
  });

  it('does not resolve while the message is still streaming', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'See <citation><type>chart</type><id>chart-1</id></citation>.',
        active: true,
        resolveCitations,
        onResolved: vi.fn(),
      }),
    );

    expect(resolveCitations).not.toHaveBeenCalled();
  });

  it('does not re-resolve once resolvedCitations is already present', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'See <citation><type>chart</type><id>chart-1</id></citation>.',
        active: false,
        resolvedCitations: {
          'chart:chart-1:': { type: 'chart', id: 'chart-1', found: true, title: 'Cached' },
        },
        resolveCitations,
        onResolved: vi.fn(),
      }),
    );

    expect(resolveCitations).not.toHaveBeenCalled();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('skips resolution entirely when the content has no citation tags', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'No citations here.',
        active: false,
        resolveCitations,
        onResolved: vi.fn(),
      }),
    );

    expect(resolveCitations).not.toHaveBeenCalled();
  });

  it('forwards a citation bubble click to onCitationClick', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;
    const onCitationClick = vi.fn();
    const resolved = { type: 'chart' as const, id: 'chart-1', found: true, title: 'Revenue' };

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'See <citation><type>chart</type><id>chart-1</id></citation>.',
        active: false,
        resolvedCitations: { 'chart:chart-1:': resolved },
        resolveCitations,
        onResolved: vi.fn(),
        onCitationClick,
      }),
    );

    fireEvent.click(screen.getByText('1'));

    expect(onCitationClick).toHaveBeenCalledWith(resolved);
  });

  it('renders suggestion tags as chips and strips them from the prose, when onSuggestionSelect is given', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'Revenue grew 8%. <suggestion>Break this down by region</suggestion>',
        active: false,
        resolveCitations,
        onResolved: vi.fn(),
        onSuggestionSelect: vi.fn(),
      }),
    );

    expect(screen.getByText('Revenue grew 8%.')).toBeDefined();
    expect(screen.queryByText(/<suggestion>/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Break this down by region' })).toBeDefined();
  });

  it('calls onSuggestionSelect with the chip text when clicked', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;
    const onSuggestionSelect = vi.fn();

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: '<suggestion>Break this down by region</suggestion>',
        active: false,
        resolveCitations,
        onResolved: vi.fn(),
        onSuggestionSelect,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Break this down by region' }));

    expect(onSuggestionSelect).toHaveBeenCalledWith('Break this down by region');
  });

  it('renders no chips when onSuggestionSelect is omitted, but still strips the tags', () => {
    const resolveCitations = vi.fn() as unknown as ResolveCitationsController;

    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'Revenue grew 8%. <suggestion>Break this down by region</suggestion>',
        active: false,
        resolveCitations,
        onResolved: vi.fn(),
      }),
    );

    expect(screen.queryByRole('button', { name: 'Break this down by region' })).toBeNull();
    // Chips are offered only on the newest message, so this is what every
    // older reply renders as. Leaving the parse tied to the chips meant a
    // reply sprouted literal `<suggestion>` markup the moment it stopped
    // being the newest one.
    expect(document.body.textContent).not.toContain('<suggestion>');
    expect(document.body.textContent).not.toContain('</suggestion>');
    expect(screen.getByText(/Revenue grew 8%/)).toBeTruthy();
  });

  /* The lead-in above the chips was dropped while the reply streamed (no chips
     yet) and restored when it finished (chips now): the tail of the message
     jumped at the very moment it completed. */
  it('keeps the lead-in above the suggestions while the reply still streams', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const resolveCitations = vi.fn(async () => []) as unknown as ResolveCitationsController;
    renderUi(
      createElement(AssistantMessageMarkdown, {
        content: 'Done.\n\nBạn muốn tôi:\n\n<suggestion>Break this down by region</suggestion>',
        active: true,
        resolveCitations,
        onResolved: vi.fn(),
      }),
    );
    for (let tick = 0; tick < 12; tick += 1) act(() => vi.advanceTimersByTime(32));
    vi.useRealTimers();

    expect(document.body.textContent).toContain('Bạn muốn tôi:');
    expect(document.body.textContent).not.toContain('<suggestion>');
  });
});

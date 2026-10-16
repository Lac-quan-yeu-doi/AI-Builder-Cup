// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import type { DisplayMessage } from '@/app/_components/chat/types';

afterEach(cleanup);

const message: DisplayMessage = {
  id: 'm1',
  role: 'user',
  content: 'which machine ran hottest?',
  timestamp: '2026-09-15T08:00:00.000Z',
};

function props(overrides: Partial<Parameters<typeof ChatMessageList>[0]> = {}) {
  return {
    messages: [message],
    isStreaming: false,
    messageRowRefs: { current: new Map<string, HTMLDivElement>() },
    resolveCitations: vi.fn().mockResolvedValue([]),
    onCitationsResolved: vi.fn(),
    onCitationClick: vi.fn(),
    onSuggestionSelect: vi.fn(),
    onInspectRun: vi.fn(),
    listPendingActions: vi.fn().mockResolvedValue([]),
    approvePendingAction: vi.fn(),
    rejectPendingAction: vi.fn(),
    ...overrides,
  };
}

function contentClasses(container: HTMLElement): string {
  return container.querySelector('[data-slot="message-scroller-content"]')?.className ?? '';
}

describe('the transcript gutter', () => {
  /*
   * The first message used to begin exactly on the scroller's clip edge, which
   * sliced the top off its bubble and guillotined every message that scrolled
   * past the floating chrome. The room has to be inside the scroll area: on the
   * wrapper it only moves where the viewport starts.
   */
  it('keeps the first message off the scroller edge by default', () => {
    const { container } = render(createElement(ChatMessageList, props()));
    const classes = contentClasses(container);

    expect(classes).toMatch(/\bpt-3\b/u);
    expect(classes).toMatch(/\bpb-3\b/u);
    expect(screen.getByText('which machine ran hottest?')).toBeTruthy();
  });

  it('names each side rather than using a py shorthand', () => {
    /*
     * A `py-*` here cannot be overridden by a caller's unprefixed `pt-*`: the
     * `sm:` half of the shorthand still wins at every width above sm, and the
     * caller's value silently does nothing. This is the trap the component
     * skill calls one property, one owner.
     */
    const { container } = render(createElement(ChatMessageList, props()));
    const classes = contentClasses(container);

    expect(classes).not.toMatch(/(^|\s)(sm:)?py-\d/u);
  });

  it('lets a surface with floating chrome ask for room to clear it', () => {
    const { container } = render(
      createElement(ChatMessageList, props({ contentClassName: 'pt-24 pb-4 sm:pt-24 sm:pb-5' })),
    );
    const classes = contentClasses(container);

    /* The caller's value survives at both widths, and the default is gone. */
    expect(classes).toMatch(/\bpt-24\b/u);
    expect(classes).toMatch(/\bsm:pt-24\b/u);
    expect(classes).not.toMatch(/\bpt-3\b/u);
    expect(classes).not.toMatch(/\bsm:pt-4\b/u);
  });

  it('still holds the reading column when a caller adds its own padding', () => {
    const { container } = render(
      createElement(ChatMessageList, props({ contentClassName: 'pt-24' })),
    );
    expect(contentClasses(container)).toMatch(/\bmax-w-3xl\b/u);
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import {
  PaneStateFailed,
  PaneStateLoading,
  PaneStateStale,
} from '@/app/(workspace)/chat/_components/stage/chat-pane-states';

afterEach(cleanup);

describe('pane states', () => {
  it('PaneStateLoading shows the given label', () => {
    render(createElement(PaneStateLoading, { label: 'Querying production_runs · 2 of 3 steps' }));
    expect(screen.getByText('Querying production_runs · 2 of 3 steps')).toBeTruthy();
  });

  it('PaneStateFailed shows the alert and calls onRetry', () => {
    const onRetry = vi.fn();
    render(
      createElement(PaneStateFailed, {
        title: 'Could not read orders',
        description: 'Timed out after 30s.',
        onRetry,
      }),
    );
    expect(screen.getByText('Could not read orders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('PaneStateStale shows the message and calls onShowLatest', () => {
    const onShowLatest = vi.fn();
    render(
      createElement(PaneStateStale, { message: 'You are reading an older version.', onShowLatest }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show latest' }));
    expect(onShowLatest).toHaveBeenCalledOnce();
  });
});

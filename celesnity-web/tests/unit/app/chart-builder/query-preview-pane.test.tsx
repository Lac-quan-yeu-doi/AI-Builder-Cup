// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueryPreviewPane } from '@/app/(workspace)/charts/_components/preview/query-preview-pane';
import { renderUi } from '@/tests/support/render-ui';

import { makePreview } from './chart-builder-test-fixtures';

afterEach(cleanup);

describe('QueryPreviewPane', () => {
  it('renders the transient query result as a table, never as a chart', () => {
    renderUi(<QueryPreviewPane status="SUCCEEDED" preview={makePreview()} />);

    expect(screen.getByRole('region', { name: /query result preview/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'region' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'west' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps the last successful rows visible when a refresh becomes stale', () => {
    renderUi(<QueryPreviewPane status="STALE" preview={makePreview()} />);

    expect(screen.getByText('west')).toBeTruthy();
    expect(
      screen.getByText('Showing the last successful query result. Refresh failed.'),
    ).toBeTruthy();
    expect(screen.queryByText(/save is disabled/i)).toBeNull();
  });

  it('shows an empty state without inventing a chart preview', () => {
    renderUi(<QueryPreviewPane status="EMPTY" preview={null} />);

    expect(screen.getByText(/run preview to load the query result table/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows client elapsed time and a retry action on failure', async () => {
    const onRetry = vi.fn();
    renderUi(
      <QueryPreviewPane
        status="FAILED"
        preview={null}
        durationMs={42}
        error="Timed out"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/client elapsed: 42 ms/i)).toBeTruthy();
    expect(screen.getByText('Timed out')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

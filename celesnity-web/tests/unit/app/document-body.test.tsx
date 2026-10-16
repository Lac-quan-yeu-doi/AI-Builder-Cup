// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentBody } from '@/app/_components/documents/document-body';
import { renderUi } from '@/tests/support/render-ui';

vi.mock('@/app/_components/shared/chart-preview-pane', () => ({
  ChartPreviewPane: ({ draft }: { draft: { title: string } }) => (
    <div data-testid="document-chart-preview">{draft.title}</div>
  ),
}));

afterEach(cleanup);

const chartPreview = {
  kind: 'preview',
  schema_version: 1,
  title: 'Monthly orders',
  description: null,
  query_definition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'demo' },
    parameters: [],
    sql: 'SELECT month, orders FROM monthly_orders',
  },
  visualization_definition: {
    schemaVersion: 1,
    type: 'LINE',
    roles: { x: 'month', measures: ['orders'] },
    display: {},
  },
  output_schema: [{ name: 'orders', type: 'bigint', family: 'NUMBER' }],
  parameter_values: {},
  rows: [['2026-01', 42]],
  run_id: 'run-1',
  row_count: 1,
  byte_count: 20,
  truncated: false,
  display_truncated: false,
};

describe('DocumentBody', () => {
  it('renders an attached chart preview at the chart-preview marker', () => {
    renderUi(
      <DocumentBody
        content={'# Orders\n\nBefore\n\n<chart-preview title="Monthly orders" />\n\nAfter'}
        chartPreviews={[chartPreview]}
        renderer={{ compile: vi.fn() }}
      />,
    );

    expect(screen.getByTestId('document-chart-preview').textContent).toBe('Monthly orders');
    expect(screen.queryByText('<chart-preview title="Monthly orders" />')).toBeNull();
    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
  });

  it('renders a persisted preview when transient chat metadata is absent', () => {
    const {
      run_id: _runId,
      row_count: _rowCount,
      byte_count: _byteCount,
      truncated: _truncated,
      display_truncated: _displayTruncated,
      ...persistedChartPreview
    } = chartPreview;

    renderUi(
      <DocumentBody
        content={'<chart-preview title="Monthly orders" />'}
        chartPreviews={[persistedChartPreview]}
        renderer={{ compile: vi.fn() }}
      />,
    );

    expect(screen.getByTestId('document-chart-preview').textContent).toBe('Monthly orders');
  });

  it('offers PDF download for a report while keeping the rendered content available', () => {
    renderUi(
      <DocumentBody
        content={'# Monthly orders\n\n<chart-preview title="Monthly orders" />'}
        chartPreviews={[chartPreview]}
        renderer={{ compile: vi.fn() }}
        pdfFilename="monthly-orders.md"
      />,
    );

    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy();
    expect(screen.queryByText('Before')).toBeNull();
    expect(screen.getByTestId('document-chart-preview')).toBeTruthy();
  });

  it('accepts a caller-owned ref for a report toolbar outside the document body', () => {
    const contentRef = createRef<HTMLDivElement>();

    renderUi(
      <DocumentBody
        content={'# Monthly orders\n\n<chart-preview title="Monthly orders" />'}
        chartPreviews={[chartPreview]}
        renderer={{ compile: vi.fn() }}
        contentRef={contentRef}
      />,
    );

    expect(contentRef.current).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
  });
});

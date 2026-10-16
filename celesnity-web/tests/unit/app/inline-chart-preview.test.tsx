// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineChartPreview } from '@/app/_components/chat/inline-chart-preview';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const payload = {
  kind: 'preview',
  schema_version: 1,
  title: 'Revenue by region',
  description: null,
  query_definition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  },
  visualization_definition: {
    schemaVersion: 1,
    type: 'TABLE',
    roles: { columns: ['region', 'revenue'] },
    display: {},
  },
  output_schema: [
    { name: 'region', type: 'varchar', family: 'STRING' },
    { name: 'revenue', type: 'double', family: 'NUMBER' },
  ],
  parameter_values: {},
  rows: [['west', 10]],
  run_id: 'run-1',
  row_count: 1,
  byte_count: 20,
  truncated: false,
  display_truncated: false,
};

const renderer = { compile: vi.fn().mockReturnValue(null) };

/*
 * The card is for reading: title, the drawing or its rows, and the notices
 * that qualify them. Keeping a chart happens on its tab on the stage, so the
 * card carries no Save control of its own.
 */
describe('InlineChartPreview', () => {
  it('renders the preview and says when only the display rows were trimmed', () => {
    renderUi(
      <InlineChartPreview
        payload={{ ...payload, display_truncated: true }}
        fallbackText="Chart preview"
        renderer={renderer}
      />,
    );

    expect(screen.getByText('Revenue by region')).toBeTruthy();
    expect(screen.getByText(/partial display/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save chart' })).toBeNull();
  });

  it('says when the preview hit the analytical limit', () => {
    renderUi(
      <InlineChartPreview
        payload={{ ...payload, truncated: true }}
        fallbackText="Chart preview"
        renderer={renderer}
      />,
    );

    expect(screen.getByText(/analytical limit/i)).toBeTruthy();
  });

  it('offers the stage button only when there is a stage, and says when it is open there', () => {
    const onOpen = vi.fn();
    const { rerender } = renderUi(
      <InlineChartPreview payload={payload} fallbackText="Chart preview" renderer={renderer} />,
    );
    expect(screen.queryByRole('button', { name: 'Open in the side panel' })).toBeNull();

    rerender(
      <InlineChartPreview
        payload={payload}
        fallbackText="Chart preview"
        renderer={renderer}
        onOpen={onOpen}
        open
      />,
    );
    screen.getByRole('button', { name: 'Open in the side panel' }).click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-slot="chat-chart-card"]')?.className).toContain(
      'border-primary/40',
    );
  });

  it('falls back safely for malformed payloads', () => {
    renderUi(
      <InlineChartPreview
        payload={{ kind: 'preview' }}
        fallbackText="Unavailable chart preview"
        renderer={renderer}
      />,
    );
    expect(screen.getByText('Unavailable chart preview')).toBeTruthy();
  });
});

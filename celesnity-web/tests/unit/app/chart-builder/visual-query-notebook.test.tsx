// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { VisualQueryNotebook } from '@/app/(workspace)/charts/_components/notebook/visual-query-notebook';
import {
  createEmptyVisualQuery,
  type VisualQueryDefinition,
} from '@/src/entities/models/canonical-chart';
import {
  addAggregation,
  addBreakout,
  addSort,
  addVisualFilter,
  makeVisualQuery,
  setQueryLimit,
} from './chart-builder-test-fixtures';

afterEach(cleanup);

const columns = [
  { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
  { name: 'created_at', dataType: 'date', nullable: false, ordinalPosition: 2 },
  { name: 'status', dataType: 'varchar', nullable: false, ordinalPosition: 3 },
];

function controllers() {
  return {
    listCatalogs: vi.fn().mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
    listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'analytics' }]),
    listTables: vi.fn().mockResolvedValue([]),
    loadTableMetadata: vi.fn(),
  };
}

function Harness({ onChange }: { readonly onChange: (query: VisualQueryDefinition) => void }) {
  const [query, setQuery] = useState(() =>
    makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
        alias: 'orders',
      },
    }),
  );
  return (
    <VisualQueryNotebook
      query={query}
      relations={{ orders: columns }}
      controllers={controllers()}
      onChange={(next) => {
        setQuery(next);
        onChange(next);
      }}
      onPreviewStep={vi.fn()}
    />
  );
}

describe('VisualQueryNotebook', () => {
  it('reveals only the starting-data picker before a source is selected', () => {
    renderUi(
      <VisualQueryNotebook
        query={createEmptyVisualQuery({ catalog: '', schema: '' })}
        relations={{}}
        controllers={controllers()}
        onChange={vi.fn()}
      />,
    );

    // The first screen is a table chooser that uses the page, not a 448px box
    // labelled "Data" in the corner of a full-bleed canvas.
    expect(screen.getByRole('heading', { name: 'Pick a table to start from' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Data step' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Catalogs' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Schemas' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Tables' })).toBeTruthy();

    expect(screen.queryByRole('region', { name: /join/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /filter step/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /summarize step/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /visualize/i })).toBeNull();

    // The steps ahead are legible before you commit to the task.
    expect(screen.getByText('Summarize')).toBeTruthy();
  });

  it('shows filter and summarize actions after a source, but defers joins', async () => {
    const onChange = vi.fn();
    const { user } = renderNotebook(onChange);

    expect(screen.getByRole('region', { name: 'Data step' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Filter step' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Summarize step' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Join data/i })).toBeNull();
    expect(screen.queryByText('Preview step')).toBeNull();
    expect(screen.getByRole('button', { name: /preview data/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /sort and limit step/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^sort$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^limit$/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /add join/i }));
    expect(screen.getByRole('region', { name: /^Join data/i })).toBeTruthy();
  });

  it('builds typed filter, summary, breakout, sort, and bounded limit steps', async () => {
    const onChange = vi.fn();
    const { user } = renderNotebook(onChange);

    await addVisualFilter(user, 'orders.created_at', 'GTE', {
      type: 'DATE',
      value: '2026-08-01',
    });
    await addAggregation(user, 'COUNT', 'orders.id', 'order_count');
    await addBreakout(user, 'orders.status');
    await addSort(user, 'order_count', 'DESC');
    await setQueryLimit(user, 2000);

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: [expect.any(Object)],
          aggregations: [expect.objectContaining({ alias: 'order_count', function: 'COUNT' })],
          breakouts: [{ kind: 'FIELD', relation: 'orders', field: 'status' }],
          orderBy: [expect.objectContaining({ direction: 'DESC' })],
          limit: 2000,
        }),
      ),
    );
  });
});

function renderNotebook(onChange: (query: VisualQueryDefinition) => void) {
  const rendered = renderUi(<Harness onChange={onChange} />);
  const user = {
    async click(element: Element) {
      fireEvent.click(element);
      await Promise.resolve();
    },
    async type(element: Element, value: string) {
      const target = element as HTMLInputElement;
      fireEvent.change(element, { target: { value: `${target.value}${value}` } });
      await Promise.resolve();
    },
    async clear(element: Element) {
      fireEvent.change(element, { target: { value: '' } });
      await Promise.resolve();
    },
    async selectOptions(element: Element, value: string) {
      fireEvent.change(element, { target: { value } });
      await Promise.resolve();
    },
  };
  return { ...rendered, user };
}

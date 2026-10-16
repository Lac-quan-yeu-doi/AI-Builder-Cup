// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SortLimitStep } from '@/app/(workspace)/charts/_components/notebook/sort-limit-step';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const relations = {
  orders: [
    { name: 'id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 },
    { name: 'status', dataType: 'VARCHAR', nullable: true, ordinalPosition: 2 },
  ],
  order_items: [{ name: 'order_id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 }],
} as const;

function makeQuery(overrides: Partial<VisualQueryDefinition> = {}): VisualQueryDefinition {
  return {
    schemaVersion: 1,
    mode: 'VISUAL',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    source: {
      table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
      alias: 'orders',
    },
    joins: [
      {
        type: 'INNER',
        table: { catalog: 'iceberg', schema: 'analytics', table: 'order_items' },
        alias: 'order_items',
        conditions: [
          {
            left: { kind: 'FIELD', relation: 'orders', field: 'id' },
            operator: 'EQ',
            right: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
          },
        ],
      },
    ],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    ...overrides,
  };
}

function Harness({
  initialQuery = makeQuery(),
  onChange = vi.fn(),
}: {
  readonly initialQuery?: VisualQueryDefinition;
  readonly onChange?: (query: VisualQueryDefinition) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <SortLimitStep
      query={query}
      relations={relations}
      onChange={(next) => {
        setQuery(next);
        onChange(next);
      }}
    />
  );
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await Promise.resolve();
}

describe('SortLimitStep', () => {
  it('selects a grouped field before direction and commits one sort transaction', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    await click(screen.getByRole('button', { name: 'Sort' }));
    await click(screen.getByRole('button', { name: 'Sort field' }));
    expect(screen.getByRole('button', { name: 'Orders fields' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Order Items fields' })).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Order Items fields' }));
    await click(screen.getByRole('option', { name: 'Order ID' }));

    await click(screen.getByRole('button', { name: 'Sort direction' }));
    await click(screen.getByRole('option', { name: 'Ascending' }));
    await click(screen.getByRole('button', { name: 'Add sort' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [
          {
            direction: 'ASC',
            expression: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
          },
        ],
      }),
    );
  });

  it('edits one sort clause without mutating the other and dismisses a pending edit', async () => {
    const onChange = vi.fn();
    renderUi(
      <Harness
        onChange={onChange}
        initialQuery={makeQuery({
          orderBy: [
            {
              expression: { kind: 'FIELD', relation: 'orders', field: 'status' },
              direction: 'DESC',
            },
            {
              expression: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
              direction: 'ASC',
            },
          ],
        })}
      />,
    );

    await click(screen.getByRole('button', { name: 'Edit Sort 1' }));
    await click(screen.getByRole('button', { name: 'Sort field' }));
    await click(screen.getByRole('button', { name: 'Orders fields' }));
    await click(screen.getByRole('option', { name: 'ID' }));
    await click(screen.getByRole('button', { name: 'Sort direction' }));
    await click(screen.getByRole('option', { name: 'Ascending' }));
    await click(screen.getByRole('button', { name: 'Update sort' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [
          {
            direction: 'ASC',
            expression: { kind: 'FIELD', relation: 'orders', field: 'id' },
          },
          {
            direction: 'ASC',
            expression: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
          },
        ],
      }),
    );

    await click(screen.getByRole('button', { name: 'Edit Sort 1' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Sort field' })).toBeNull();
  });

  it('keeps limit changes local until Apply and rejects invalid bounds', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    await click(screen.getByRole('button', { name: 'Limit' }));
    const limit = screen.getByRole('spinbutton', { name: 'Query limit' });
    fireEvent.change(limit, { target: { value: '0' } });
    expect(
      (screen.getByRole('button', { name: 'Apply limit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(limit, { target: { value: 'abc' } });
    expect(
      (screen.getByRole('button', { name: 'Apply limit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(limit, { target: { value: '2147483648' } });
    expect(
      (screen.getByRole('button', { name: 'Apply limit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(limit, { target: { value: '2000' } });
    await click(screen.getByRole('button', { name: 'Apply limit' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 2000 }));
  });
});

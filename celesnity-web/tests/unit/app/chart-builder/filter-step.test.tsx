// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterStep } from '@/app/(workspace)/charts/_components/notebook/filter-step';
import { filterDraftToExpression } from '@/app/(workspace)/charts/_components/notebook/filter-clause-editor';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import type { FieldOptionViewModel } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import { renderUi } from '@/tests/support/render-ui';
import { makeVisualQuery } from './chart-builder-test-fixtures';

afterEach(cleanup);

const relations = {
  orders: [
    { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
    { name: 'status', dataType: 'varchar', nullable: true, ordinalPosition: 2 },
    { name: 'is_active', dataType: 'boolean', nullable: true, ordinalPosition: 3 },
  ],
  order_items: [{ name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
} as const;

function makeQuery(): VisualQueryDefinition {
  return makeVisualQuery({
    source: {
      table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
      alias: 'orders',
    },
    joins: [
      {
        type: 'LEFT',
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
        alias: 'order_items',
        conditions: [],
      },
    ],
  });
}

function Harness({ onChange }: { readonly onChange: (query: VisualQueryDefinition) => void }) {
  const [query, setQuery] = useState(makeQuery);
  return (
    <FilterStep
      query={query}
      relations={relations}
      onChange={(next) => {
        setQuery(next);
        onChange(next);
      }}
    />
  );
}

async function chooseField(field: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Filter field' }));
  expect(screen.getByRole('button', { name: 'Orders fields' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Order Items fields' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Order Items fields' }));
  fireEvent.click(screen.getByRole('option', { name: field }));
}

describe('FilterStep', () => {
  it('adds a typed filter only after field, operator, and value are confirmed', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add filters to narrow your answer' }));
    await chooseField('Order ID');
    const value = screen.getByRole('spinbutton', { name: 'Filter value' });
    fireEvent.change(value, { target: { value: '42' } });

    expect(screen.getByRole('button', { name: 'Add filter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: [
            {
              kind: 'BINARY',
              operator: 'EQ',
              left: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
              right: { kind: 'LITERAL', valueType: 'NUMBER', value: 42 },
            },
          ],
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Edit Filter 1' }).textContent).toContain(
      'Order ID is 42',
    );
  });

  it('edits the same clause and removes it without creating a second clause', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add filters to narrow your answer' }));
    await chooseField('Order ID');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Filter value' }), {
      target: { value: '42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Filter 1' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Filter value' }), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update filter' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: [
            expect.objectContaining({ right: { kind: 'LITERAL', valueType: 'NUMBER', value: 7 } }),
          ],
        }),
      ),
    );
    expect(screen.getAllByRole('button', { name: /Edit Filter/u })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Filter 1' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filters: [] })),
    );
  });

  it('keeps the canonical query unchanged when the draft is dismissed', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add filters to narrow your answer' }));
    await chooseField('Order ID');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Filter value' }), {
      target: { value: '99' },
    });
    const callsBeforeDismiss = onChange.mock.calls.length;
    fireEvent.keyDown(screen.getByTestId('filter-clause-editor'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledTimes(callsBeforeDismiss);
    expect(screen.getByRole('button', { name: 'Add filters to narrow your answer' })).toBeTruthy();
  });

  it('maps null operators to unary expressions and restores a selected field', () => {
    const field: FieldOptionViewModel = {
      id: 'orders.status',
      relation: 'orders',
      name: 'status',
      label: 'Status',
      dataType: 'varchar',
      family: 'TEXT',
    };
    expect(
      filterDraftToExpression({
        target: 'WHERE',
        field,
        operator: 'IS_NULL',
        value: '',
      }),
    ).toEqual({
      kind: 'UNARY',
      operator: 'IS_NULL',
      operand: { kind: 'FIELD', relation: 'orders', field: 'status' },
    });
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { JoinEditor } from '@/app/(workspace)/charts/_components/notebook/join-editor';
import { makeVisualQuery } from './chart-builder-test-fixtures';

afterEach(cleanup);

function controllers() {
  return {
    listCatalogs: vi.fn().mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
    listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'kasadata' }]),
    listTables: vi.fn().mockResolvedValue([]),
    loadTableMetadata: vi.fn(),
  };
}

describe('JoinEditor', () => {
  it('keeps the join draft incomplete until both field controls are selected', async () => {
    const onChange = vi.fn();
    const joinControllers = {
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
      listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'kasadata' }]),
      listTables: vi
        .fn()
        .mockResolvedValue([
          { catalog: 'iceberg', schema: 'kasadata', name: 'order_items', tableType: 'BASE TABLE' },
        ]),
      loadTableMetadata: vi.fn().mockResolvedValue({
        catalog: 'iceberg',
        schema: 'kasadata',
        name: 'order_items',
        columns: [{ name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
      }),
    };
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
    });

    renderUi(
      <JoinEditor
        query={query}
        relations={{
          orders: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
        }}
        controllers={joinControllers}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add join/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^iceberg$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^kasadata$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^kasadata$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^order_items/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^order_items/i }));

    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('join-table-band')).toBeTruthy());
    expect(screen.getByText('on', { exact: true })).toBeTruthy();
    expect(screen.getByTestId('join-condition-band')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Join 1 left field 1' }));
    expect(screen.getByRole('button', { name: 'Orders fields' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Order Items fields' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'ID' }));

    fireEvent.click(screen.getByRole('button', { name: 'Join 1 right field 1' }));
    expect(screen.getByRole('button', { name: 'Order Items fields' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Orders fields' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Order ID' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          joins: [
            expect.objectContaining({
              type: 'LEFT',
              alias: 'order_items',
              conditions: [
                {
                  left: { kind: 'FIELD', relation: 'orders', field: 'id' },
                  operator: 'EQ',
                  right: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
                },
              ],
            }),
          ],
        }),
      ),
    );
  });

  it('renders each join condition as independent controls in two equal bands', () => {
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
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
    });

    renderUi(
      <JoinEditor
        query={query}
        relations={{
          orders: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
          order_items: [
            { name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
          ],
        }}
        controllers={controllers()}
        onChange={vi.fn()}
      />,
    );

    const tableBand = screen.getByTestId('join-table-band');
    const conditionBand = screen.getByTestId('join-condition-band');
    const splitRow = tableBand.parentElement;

    expect(splitRow?.children).toHaveLength(3);
    expect(splitRow?.children.item(0)).toBe(tableBand);
    expect(splitRow?.children.item(1)?.textContent).toBe('on');
    expect(splitRow?.children.item(2)).toBe(conditionBand);
    expect(screen.getByTestId('notebook-step-content').getAttribute('data-surface')).toBe('CLEAR');
    expect(tableBand.className).toContain('min-h-18');
    expect(tableBand.className).toContain('p-4');
    expect(conditionBand.className).toContain('min-h-18');
    expect(conditionBand.className).toContain('p-2.5');
    expect(screen.getByRole('button', { name: 'Join 1 left field 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join 1 operator 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join 1 right field 1' })).toBeTruthy();
  });

  it('renders solid table chips, a visual join-type menu, and relation labels in conditions', () => {
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
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
    });

    renderUi(
      <JoinEditor
        query={query}
        relations={{
          orders: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
          order_items: [
            { name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
          ],
        }}
        controllers={controllers()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Source table chip' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Join 1 table chip' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Join 1 type' }));
    expect(screen.getByRole('button', { name: 'Left outer join' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Right outer join' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inner join' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Full outer join' })).toBeTruthy();

    const condition = screen.getByTestId('join-condition-chip');
    expect(within(condition).getByText('Orders')).toBeTruthy();
    expect(within(condition).getByText('Order Items')).toBeTruthy();
  });

  it('uses the joined-table arrow to select its projected columns', () => {
    const onChange = vi.fn();
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
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
    });

    renderUi(
      <JoinEditor
        query={query}
        relations={{
          orders: [
            { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
            { name: 'status', dataType: 'varchar', nullable: false, ordinalPosition: 2 },
          ],
          order_items: [
            { name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
            { name: 'quantity', dataType: 'bigint', nullable: false, ordinalPosition: 2 },
          ],
        }}
        controllers={controllers()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Join 1 columns' }));
    const selectAll = screen.getByRole('button', { name: 'Select all Order Items fields' });
    expect(selectAll).toBeTruthy();
    expect(selectAll.closest('[role="listbox"]')).toBeNull();
    const orderId = screen.getByRole('option', { name: 'Order ID' });
    expect(orderId.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(orderId);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projections: [
          expect.objectContaining({ alias: 'id' }),
          expect.objectContaining({ alias: 'status' }),
          expect.objectContaining({ alias: 'quantity' }),
        ],
      }),
    );
  });

  it('stages a replacement table until its new fields are selected', async () => {
    const onChange = vi.fn();
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
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
    });
    const replacementControllers = {
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
      listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'kasadata' }]),
      listTables: vi
        .fn()
        .mockResolvedValue([
          { catalog: 'iceberg', schema: 'kasadata', name: 'customers', tableType: 'BASE TABLE' },
        ]),
      loadTableMetadata: vi.fn().mockResolvedValue({
        catalog: 'iceberg',
        schema: 'kasadata',
        name: 'customers',
        columns: [{ name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
      }),
    };

    renderUi(
      <JoinEditor
        query={query}
        relations={{
          orders: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
          order_items: [
            { name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
          ],
        }}
        controllers={replacementControllers}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Join 1 table' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^iceberg$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^kasadata$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^kasadata$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^customers/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^customers/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Join 1 table' }).textContent).toContain(
        'Customers',
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Join 1 left field 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join 1 right field 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join 1 left field 1' }));
    fireEvent.click(screen.getByRole('option', { name: 'ID' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join 1 right field 1' }));
    fireEvent.click(screen.getByRole('option', { name: 'Order ID' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          joins: [
            expect.objectContaining({
              table: { catalog: 'iceberg', schema: 'kasadata', table: 'customers' },
              alias: 'customers',
              conditions: [
                {
                  left: { kind: 'FIELD', relation: 'orders', field: 'id' },
                  operator: 'EQ',
                  right: { kind: 'FIELD', relation: 'customers', field: 'order_id' },
                },
              ],
            }),
          ],
        }),
      ),
    );
  });

  it('keeps the join band hidden until the user starts adding a join', () => {
    renderUi(
      <JoinEditor
        query={makeVisualQuery({
          source: {
            table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
            alias: 'orders',
          },
        })}
        relations={{
          orders: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
        }}
        controllers={controllers()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('region', { name: /^Join data/i })).toBeNull();
    expect(screen.getByRole('button', { name: /add join/i })).toBeTruthy();
  });
});

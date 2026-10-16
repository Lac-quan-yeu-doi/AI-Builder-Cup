// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { DataStep } from '@/app/(workspace)/charts/_components/notebook/data-step';
import { makeVisualQuery } from './chart-builder-test-fixtures';

afterEach(cleanup);

function controllers() {
  return {
    listCatalogs: vi.fn().mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'iceberg' }]),
    listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'kasadata' }]),
    listTables: vi
      .fn()
      .mockResolvedValue([
        { catalog: 'iceberg', schema: 'kasadata', name: 'orders', tableType: 'BASE TABLE' },
      ]),
    loadTableMetadata: vi.fn().mockResolvedValue({
      catalog: 'iceberg',
      schema: 'kasadata',
      name: 'orders',
      columns: [{ name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
    }),
  };
}

describe('DataStep', () => {
  it('selects the base table from metadata without a free-text table input', async () => {
    const onChange = vi.fn();
    renderUi(
      <DataStep
        query={makeVisualQuery({
          source: {
            table: { catalog: 'iceberg', schema: 'analytics', table: '' },
            alias: 'source',
          },
        })}
        relations={{}}
        controllers={controllers()}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^iceberg$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^kasadata$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^kasadata$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^orders/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          context: { catalog: 'iceberg', schema: 'kasadata' },
          source: expect.objectContaining({
            table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
            alias: 'orders',
          }),
        }),
      ),
    );
    expect(screen.queryByRole('textbox', { name: /base table/i })).toBeNull();
  });

  it('creates a valid SQL alias when the physical table name begins with a digit', async () => {
    const onChange = vi.fn();
    const numericControllers = controllers();
    numericControllers.listTables.mockResolvedValue([
      { catalog: 'iceberg', schema: 'kasadata', name: '321654', tableType: 'BASE TABLE' },
    ]);
    numericControllers.loadTableMetadata.mockResolvedValue({
      catalog: 'iceberg',
      schema: 'kasadata',
      name: '321654',
      columns: [{ name: '2026', dataType: 'bigint', nullable: false, ordinalPosition: 1 }],
    });

    renderUi(
      <DataStep
        query={makeVisualQuery({
          source: {
            table: { catalog: 'iceberg', schema: 'analytics', table: '' },
            alias: 'source',
          },
        })}
        relations={{}}
        controllers={numericControllers}
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^iceberg$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^kasadata$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^321654/i }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({
            table: { catalog: 'iceberg', schema: 'kasadata', table: '321654' },
            alias: 'source_321654',
          }),
        }),
      ),
    );
  });

  it('uses the solid source chip itself to change data without separate data actions', async () => {
    renderUi(
      <DataStep
        query={makeVisualQuery({
          source: {
            table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
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

    const changeData = screen.getByRole('button', { name: 'Change data' });
    expect(changeData.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Source table');
    expect(screen.queryByRole('button', { name: 'Pick columns' })).toBeNull();

    fireEvent.click(changeData);
    await waitFor(() => expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy());
  });
});

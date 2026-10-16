// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { DataSourcePicker } from '@/app/(workspace)/charts/_components/data-source-picker/data-source-picker';

afterEach(cleanup);

const metadata = {
  catalog: 'iceberg',
  schema: 'kasadata',
  name: 'orders',
  columns: [
    { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
    { name: 'revenue', dataType: 'double', nullable: true, ordinalPosition: 2 },
  ],
};

function controllers() {
  return {
    listCatalogs: vi.fn().mockResolvedValue([
      { name: 'iceberg', jdbcCatalogIdentity: 'iceberg' },
      { name: 'hive', jdbcCatalogIdentity: 'hive' },
    ]),
    listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'kasadata' }]),
    listTables: vi
      .fn()
      .mockResolvedValue([
        { catalog: 'iceberg', schema: 'kasadata', name: 'orders', tableType: 'BASE TABLE' },
      ]),
    loadTableMetadata: vi.fn().mockResolvedValue(metadata),
  };
}

describe('DataSourcePicker', () => {
  it('browses catalog, schema, and table before returning metadata', async () => {
    const api = controllers();
    const onSelect = vi.fn();
    renderUi(<DataSourcePicker mode="TABLE" controllers={api} onSelect={onSelect} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^iceberg$/i }));
    await waitFor(() => expect(api.listNamespaces).toHaveBeenCalledWith('iceberg'));
    fireEvent.click(screen.getByRole('button', { name: /^kasadata$/i }));
    await waitFor(() => expect(api.listTables).toHaveBeenCalledWith('iceberg', 'kasadata'));
    fireEvent.click(screen.getByRole('button', { name: /^orders/i }));

    await waitFor(() =>
      expect(api.loadTableMetadata).toHaveBeenCalledWith({
        catalog: 'iceberg',
        schema: 'kasadata',
        table: 'orders',
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ catalog: 'iceberg', schema: 'kasadata', table: 'orders' }),
    );
    expect(onSelect.mock.calls[0]?.[0].columns).toEqual(metadata.columns);
  });

  it('drills through one level at a time', async () => {
    const api = controllers();
    renderUi(<DataSourcePicker mode="TABLE" controllers={api} onSelect={vi.fn()} />);

    const catalogs = await screen.findByRole('list', { name: 'Catalogs' });
    expect(catalogs.className).toContain('overflow-y-auto');
    // The compact picker is for changing an already-chosen source. Starting a
    // question goes through `SourceStart`, which puts all three columns on the
    // page — so the "Browse all data" dialog that used to hang off this footer
    // has nothing left to offer.
    expect(screen.queryByRole('button', { name: 'Browse all data' })).toBeNull();
    expect(screen.getByRole('button', { name: /^iceberg$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^kasadata$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^iceberg$/i }));
    expect(await screen.findByRole('button', { name: /^kasadata$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^iceberg$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^kasadata$/i }));
    expect(await screen.findByRole('button', { name: /^orders/i })).toBeTruthy();
  });

  it('selects a schema directly for native query context without showing tables', async () => {
    const api = controllers();
    const onSelect = vi.fn();
    renderUi(<DataSourcePicker mode="CONTEXT" controllers={api} onSelect={onSelect} />);

    fireEvent.click(await screen.findByRole('button', { name: /^iceberg$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^kasadata$/i }));

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({
        catalog: 'iceberg',
        schema: 'kasadata',
        columns: [],
      }),
    );
    expect(screen.queryByRole('button', { name: /^orders/i })).toBeNull();
  });
});

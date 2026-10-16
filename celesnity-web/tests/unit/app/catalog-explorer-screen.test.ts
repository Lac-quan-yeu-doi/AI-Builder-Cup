// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogExplorerScreen } from '@/app/(workspace)/catalog/_components/catalog-explorer-screen';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('catalog explorer database creation', () => {
  it('creates a database and refreshes its expanded catalog namespace list', async () => {
    const createNamespace = vi
      .fn()
      .mockResolvedValue({ catalog: 'iceberg', name: 'curated_sales' });
    const listNamespaces = vi
      .fn()
      .mockResolvedValue([{ catalog: 'iceberg', name: 'curated_sales' }]);
    const controllers = Object.freeze({
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
      createNamespace,
      updateNamespaceDescription: vi.fn(),
      listNamespaces,
      listTables: vi.fn().mockResolvedValue([]),
      loadMetadata: vi.fn(),
      listSnapshots: vi.fn(),
      preview: vi.fn(),
    }) as unknown as Parameters<typeof CatalogExplorerScreen>[0]['controllers'];

    render(createElement(CatalogExplorerScreen, { controllers }));

    expect(await screen.findByText('curated_sales')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Create database' }));
    expect(within(screen.getByRole('dialog')).queryByLabelText('Catalog')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('curated_sales'), {
      target: { value: 'curated_sales' },
    });
    fireEvent.change(screen.getByPlaceholderText('What data does this database contain?'), {
      target: { value: 'Curated sales reporting data' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create database' }),
    );

    await waitFor(() =>
      expect(createNamespace).toHaveBeenCalledWith(
        'iceberg',
        'curated_sales',
        'Curated sales reporting data',
      ),
    );
    await waitFor(() => expect(listNamespaces).toHaveBeenCalledWith('iceberg'));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Database curated_sales was created.',
    );
  });

  it('renders database namespaces as a flat, filterable list without source catalog', async () => {
    const updateNamespaceDescription = vi.fn().mockResolvedValue({
      catalog: 'iceberg',
      name: 'analytics',
      description: 'Updated reporting datasets',
    });
    const controllers = Object.freeze({
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
      createNamespace: vi.fn(),
      updateNamespaceDescription,
      listNamespaces: vi.fn().mockResolvedValue([
        { catalog: 'iceberg', name: 'analytics', description: 'Reporting datasets' },
        { catalog: 'iceberg', name: 'test' },
      ]),
      listTables: vi.fn(),
      loadMetadata: vi.fn(),
      listSnapshots: vi.fn(),
      preview: vi.fn(),
    }) as unknown as Parameters<typeof CatalogExplorerScreen>[0]['controllers'];

    render(createElement(CatalogExplorerScreen, { controllers, view: 'databases' }));

    expect(await screen.findByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Source catalog/i })).toBeNull();
    expect(screen.getByText('analytics')).toBeTruthy();
    expect(screen.getByText('Reporting datasets')).toBeTruthy();
    expect(screen.getByText('test')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filter databases'), {
      target: { value: 'analytics' },
    });
    expect(screen.getByText('analytics')).toBeTruthy();
    expect(screen.queryByText('test')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter databases'), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit description' })[0]!);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Description (optional)'), {
      target: { value: 'Updated reporting datasets' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateNamespaceDescription).toHaveBeenCalledWith(
        'iceberg',
        'analytics',
        'Updated reporting datasets',
      ),
    );
    expect((await screen.findByRole('status')).textContent).toBe(
      'The description for analytics was updated.',
    );
  });

  it('renders tables as a flat list for the selected database', async () => {
    const listTables = vi
      .fn()
      .mockResolvedValue([
        { catalog: 'iceberg', schema: 'analytics', name: 'orders', tableType: 'BASE TABLE' },
      ]);
    const controllers = Object.freeze({
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
      createNamespace: vi.fn(),
      updateNamespaceDescription: vi.fn(),
      listNamespaces: vi.fn().mockResolvedValue([{ catalog: 'iceberg', name: 'analytics' }]),
      listTables,
      loadMetadata: vi.fn(),
      listSnapshots: vi.fn(),
      preview: vi.fn(),
    }) as unknown as Parameters<typeof CatalogExplorerScreen>[0]['controllers'];

    render(createElement(CatalogExplorerScreen, { controllers, view: 'tables' }));

    expect(await screen.findByRole('button', { name: 'orders' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Database' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy();
    expect(screen.getByText('BASE TABLE')).toBeTruthy();
    expect(listTables).toHaveBeenCalledWith('iceberg', 'analytics');
  });

  it('opens a deep-linked device table and starts its live event monitor', async () => {
    const monitorPreview = vi.fn((_request, handlers) => {
      handlers.onSnapshot({
        columns: [
          { name: 'received_at', type: 'timestamp' },
          { name: 'device_id', type: 'varchar' },
          { name: 'payload_json', type: 'varchar' },
        ],
        rows: [
          ['2026-09-07T10:30:00Z', '78a5815e-076c-48b6-b812-81f6422c5f93', '{"temperature":24.5}'],
        ],
        rowCount: 1,
      });
      return { close: vi.fn() };
    });
    const controllers = Object.freeze({
      listCatalogs: vi
        .fn()
        .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
      createNamespace: vi.fn(),
      updateNamespaceDescription: vi.fn(),
      listNamespaces: vi
        .fn()
        .mockResolvedValue([{ catalog: 'iceberg', name: 'tnt_factory_bronze' }]),
      listTables: vi.fn().mockResolvedValue([
        {
          catalog: 'iceberg',
          schema: 'tnt_factory_bronze',
          name: 'mqtt_events',
          tableType: 'BASE TABLE',
        },
      ]),
      loadMetadata: vi.fn().mockResolvedValue({
        catalog: 'iceberg',
        schema: 'tnt_factory_bronze',
        name: 'mqtt_events',
        columns: [],
      }),
      listSnapshots: vi.fn().mockResolvedValue([]),
      preview: vi.fn(),
      monitorPreview,
    }) as unknown as Parameters<typeof CatalogExplorerScreen>[0]['controllers'];

    render(
      createElement(CatalogExplorerScreen, {
        controllers,
        view: 'tables',
        initialDeviceEvent: {
          table: {
            catalog: 'iceberg',
            schema: 'tnt_factory_bronze',
            table: 'mqtt_events',
          },
          deviceId: '78a5815e-076c-48b6-b812-81f6422c5f93',
          deviceName: 'Virtual temperature sensor 1',
        },
      }),
    );

    expect(await screen.findByText('Virtual temperature sensor 1 events')).toBeTruthy();
    expect(screen.getByText('● Live')).toBeTruthy();
    expect(screen.getByText('{"temperature":24.5}')).toBeTruthy();
    expect(controllers.listSnapshots).not.toHaveBeenCalled();
    expect(monitorPreview).toHaveBeenCalledWith(
      {
        catalog: 'iceberg',
        schema: 'tnt_factory_bronze',
        table: 'mqtt_events',
        deviceId: '78a5815e-076c-48b6-b812-81f6422c5f93',
      },
      expect.objectContaining({ onSnapshot: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});

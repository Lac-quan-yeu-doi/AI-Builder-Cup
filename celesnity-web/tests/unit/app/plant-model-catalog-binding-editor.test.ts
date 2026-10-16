// @vitest-environment jsdom

import { createElement, useState } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogBindingEditor } from '@/app/(workspace)/plant-model/[siteId]/_components/catalog-binding-editor';
import type { CatalogMetadataControllers } from '@/app/(workspace)/plant-model/[siteId]/_components/catalog-binding-editor';
import type { PlantPropertyDefinition } from '@/src/entities/models/plant-model';
import { renderUi as render } from '@/tests/support/render-ui';

const property: PlantPropertyDefinition = {
  id: 'status',
  key: 'status',
  name: 'Status',
  type: 'catalog-choices',
  required: false,
  order: 0,
  catalogBinding: {
    mode: 'choices',
    catalog: '',
    schema: '',
    table: '',
    valueColumn: '',
    filters: [],
  },
};

const metadata: CatalogMetadataControllers = {
  listCatalogs: vi.fn(async () => [{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
  listNamespaces: vi.fn(async () => [{ catalog: 'iceberg', name: 'demo' }]),
  listTables: vi.fn(async () => [
    { catalog: 'iceberg', schema: 'demo', name: 'plant_statuses', tableType: 'BASE TABLE' },
  ]),
  loadTableMetadata: vi.fn(async () => ({
    catalog: 'iceberg',
    schema: 'demo',
    name: 'plant_statuses',
    columns: [
      { name: 'id', dataType: 'integer', nullable: false, ordinalPosition: 1 },
      { name: 'status', dataType: 'varchar', nullable: false, ordinalPosition: 2 },
      { name: 'label', dataType: 'varchar', nullable: false, ordinalPosition: 3 },
    ],
  })),
};

function Harness() {
  const [current, setCurrent] = useState(property);
  return createElement(
    'div',
    null,
    createElement(CatalogBindingEditor, {
      property: current,
      availableProperties: [],
      metadata,
      update: setCurrent,
    }),
    createElement('output', { 'data-testid': 'binding' }, JSON.stringify(current.catalogBinding)),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Plant Model catalog binding editor', () => {
  it('loads dependent metadata and stores only selected identifiers', async () => {
    render(createElement(Harness));

    await waitFor(() =>
      expect(screen.getByLabelText('Catalog').hasAttribute('disabled')).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Catalog'), { target: { value: 'iceberg' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Schema').hasAttribute('disabled')).toBe(false),
    );
    expect(metadata.listNamespaces).toHaveBeenCalledWith('iceberg', 'readable');
    fireEvent.change(screen.getByLabelText('Schema'), { target: { value: 'demo' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Table').hasAttribute('disabled')).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Table'), {
      target: { value: 'plant_statuses' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Value column').hasAttribute('disabled')).toBe(false),
    );
    expect(metadata.loadTableMetadata).toHaveBeenCalledWith({
      catalog: 'iceberg',
      schema: 'demo',
      table: 'plant_statuses',
    });
    fireEvent.change(screen.getByLabelText('Value column'), { target: { value: 'status' } });
    fireEvent.change(screen.getByLabelText('Label column (optional)'), {
      target: { value: 'label' },
    });

    expect(screen.getByTestId('binding').textContent).toContain(
      '"catalog":"iceberg","schema":"demo","table":"plant_statuses","valueColumn":"status","filters":[],"labelColumn":"label"',
    );
  });

  it('clears dependent identifiers when an upstream selection changes', async () => {
    const configured: PlantPropertyDefinition = {
      ...property,
      catalogBinding: {
        mode: 'choices',
        catalog: 'iceberg',
        schema: 'demo',
        table: 'plant_statuses',
        valueColumn: 'status',
        labelColumn: 'label',
        filters: [{ column: 'id', operator: 'eq', operand: { kind: 'literal', value: 1 } }],
      },
    };
    function ConfiguredHarness() {
      const [current, setCurrent] = useState(configured);
      return createElement(
        'div',
        null,
        createElement(CatalogBindingEditor, {
          property: current,
          availableProperties: [],
          metadata,
          update: setCurrent,
        }),
        createElement(
          'output',
          { 'data-testid': 'configured-binding' },
          JSON.stringify(current.catalogBinding),
        ),
      );
    }
    render(createElement(ConfiguredHarness));

    await waitFor(() =>
      expect(screen.getByLabelText('Catalog').hasAttribute('disabled')).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Catalog'), { target: { value: '' } });

    expect(screen.getByTestId('configured-binding').textContent).toBe(
      '{"mode":"choices","catalog":"","schema":"","table":"","valueColumn":"","filters":[]}',
    );
  });
});

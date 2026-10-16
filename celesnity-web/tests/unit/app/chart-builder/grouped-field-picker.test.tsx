// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FieldGroupViewModel } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import { GroupedFieldPicker } from '@/app/(workspace)/charts/_components/notebook/grouped-field-picker';
import { NotebookEditorProvider } from '@/app/(workspace)/charts/_components/notebook/notebook-editor-context';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const groups: readonly FieldGroupViewModel[] = [
  {
    id: 'brands',
    relation: 'brands',
    label: 'Brands',
    role: 'SOURCE',
    fields: [
      {
        id: 'brands.id',
        relation: 'brands',
        name: 'id',
        label: 'ID',
        dataType: 'bigint',
        family: 'NUMBER',
      },
      {
        id: 'brands.name',
        relation: 'brands',
        name: 'name',
        label: 'Name',
        dataType: 'varchar',
        family: 'TEXT',
      },
    ],
  },
  {
    id: 'orders',
    relation: 'orders',
    label: 'Orders',
    role: 'JOIN',
    fields: [
      {
        id: 'orders.id',
        relation: 'orders',
        name: 'id',
        label: 'ID',
        dataType: 'bigint',
        family: 'NUMBER',
      },
    ],
  },
];

function renderPicker(onSelect = vi.fn(), selectedIds: readonly string[] = []): void {
  renderUi(
    <NotebookEditorProvider>
      <GroupedFieldPicker
        editorId="filter-1"
        ariaLabel="Filter field"
        groups={groups}
        selectedIds={selectedIds}
        trigger={<button type="button">Choose field</button>}
        onSelect={onSelect}
      />
    </NotebookEditorProvider>,
  );
}

describe('GroupedFieldPicker', () => {
  it('opens multi-table groups collapsed and keeps only one expanded', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Choose field' }));

    expect(
      screen.getByRole('button', { name: 'Brands fields' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Orders fields' }).getAttribute('aria-expanded'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Brands fields' }));
    expect(screen.getByRole('option', { name: /ID/u })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Orders fields' }));
    expect(
      screen.getByRole('button', { name: 'Brands fields' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Orders fields' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('expands the only group and search temporarily reveals matching fields', () => {
    renderUi(
      <NotebookEditorProvider>
        <GroupedFieldPicker
          editorId="single"
          ariaLabel="Single field"
          groups={[groups[0]!]}
          trigger={<button type="button">Choose single field</button>}
          onSelect={vi.fn()}
        />
      </NotebookEditorProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose single field' }));
    expect(
      screen.getByRole('button', { name: 'Brands fields' }).getAttribute('aria-expanded'),
    ).toBe('true');
    cleanup();
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Choose field' }));

    // The multi-group picker is collapsed until the user searches or expands it.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find fields' }), {
      target: { value: 'brand name' },
    });
    expect(screen.getByRole('option', { name: /Name/u })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find fields' }), {
      target: { value: '' },
    });
    expect(
      screen.getByRole('button', { name: 'Brands fields' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('selects a field and restores focus after Escape', () => {
    const onSelect = vi.fn();
    renderPicker(onSelect);
    const trigger = screen.getByRole('button', { name: 'Choose field' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Brands fields' }));
    fireEvent.click(screen.getByRole('option', { name: /Name/u }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'brands.name' }));

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Find fields' }), { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});

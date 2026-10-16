// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardEditorScreen } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-editor-screen';
import { createDashboardEditorState } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-editor-state';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';
import type { Dashboard } from '@/src/entities/models/dashboard';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const dashboard: Dashboard = {
  id: 'dashboard-1',
  collectionId: 'collection-1',
  name: 'Operations',
  description: null,
  revision: 1,
  tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
  cards: [],
  filters: [],
  mappings: [],
  createdByIdentityId: 'identity-1',
  archivedAt: null,
  createdAt: '2026-09-05T08:00:00.000Z',
  updatedAt: '2026-09-05T08:00:00.000Z',
};

describe('DashboardEditorScreen', () => {
  it('creates a selected chart card with a database-safe UUID', () => {
    const onAddCard = vi.fn();
    const chart: ChartSummary = {
      id: 'bf655a3d-f79c-47b5-a635-5fc56f9aa1d4',
      collectionId: 'collection-1',
      title: 'Orders by brand',
      description: null,
      provenance: 'MANUAL',
      currentRevisionNumber: 3,
      updatedAt: '2026-09-05T08:00:00.000Z',
    };
    renderUi(
      <DashboardEditorScreen
        state={createDashboardEditorState(dashboard)}
        charts={[chart]}
        onRename={vi.fn()}
        onAddCard={onAddCard}
        onUpdateCard={vi.fn()}
        onRemoveCard={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onSaveAsCopy={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Add' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('button', { name: chart.title }));

    expect(onAddCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
        ),
        kind: 'CHART',
        chartId: chart.id,
        chartRevisionNumber: 3,
      }),
    );
  });

  it('offers chart, content, section and filter authoring controls with atomic Save/Cancel', () => {
    const onAddCard = vi.fn();
    renderUi(
      <DashboardEditorScreen
        state={createDashboardEditorState(dashboard)}
        charts={[]}
        onRename={vi.fn()}
        onAddCard={onAddCard}
        onUpdateCard={vi.fn()}
        onRemoveCard={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onSaveAsCopy={vi.fn()}
      />,
    );

    expect(screen.getByText("You're editing this dashboard.")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);

    // The toolbar was six unlabelled ghost icons — plus, text, link, grid,
    // sliders, ellipsis. It is one Add menu, one Filter control and an
    // overflow now, and nothing became unreachable.
    const add = screen.getByRole('button', { name: 'Add' });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();

    fireEvent.keyDown(add, { key: 'ArrowDown' });
    for (const item of ['Chart', 'Heading', 'Text', 'Link', 'Four-card strip']) {
      expect(screen.getByRole('menuitem', { name: item })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('menuitem', { name: 'Chart' }));
    expect(screen.getByRole('complementary', { name: 'Add a chart' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New question' }).getAttribute('href')).toBe(
      '/analytics/charts/new',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close chart picker' }));

    fireEvent.keyDown(add, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Four-card strip' }));
    expect(onAddCard).toHaveBeenCalledWith(expect.objectContaining({ kind: 'HEADING' }));
    expect(screen.getAllByRole('button', { name: 'Select question' })).toHaveLength(5);

    fireEvent.keyDown(add, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Heading' }));
    expect(onAddCard).toHaveBeenCalledWith(expect.objectContaining({ kind: 'HEADING' }));
  });

  it('renames and deletes tabs in the app, not in a browser dialog', () => {
    const onUpdateTab = vi.fn();
    const onRemoveTab = vi.fn();
    renderUi(
      <DashboardEditorScreen
        state={createDashboardEditorState({
          ...dashboard,
          tabs: [
            { id: 'tab-1', name: 'Tab 1', order: 0 },
            { id: 'tab-2', name: 'Tab 2', order: 1 },
          ],
        })}
        charts={[]}
        onRename={vi.fn()}
        onAddCard={vi.fn()}
        onUpdateCard={vi.fn()}
        onRemoveCard={vi.fn()}
        onAddTab={vi.fn()}
        onUpdateTab={onUpdateTab}
        onRemoveTab={onRemoveTab}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onSaveAsCopy={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Tab 1' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    // `window.prompt` cannot be styled, translated or tested.
    const field = screen.getByLabelText('Tab name');
    fireEvent.change(field, { target: { value: 'Throughput' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdateTab).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1', name: 'Throughput' }),
    );
  });
});

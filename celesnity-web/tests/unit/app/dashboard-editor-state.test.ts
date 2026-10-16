import { describe, expect, it } from 'vitest';

import {
  createDashboardEditorState,
  dashboardEditorReducer,
} from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-editor-state';
import type { Dashboard } from '@/src/entities/models/dashboard';

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

describe('dashboard editor reducer', () => {
  it('keeps edits local and Cancel restores the complete server aggregate', () => {
    const initial = createDashboardEditorState(dashboard);
    const edited = dashboardEditorReducer(initial, {
      type: 'rename',
      name: 'Changed',
      description: 'Draft only',
    });

    expect(edited.dirty).toBe(true);
    expect(edited.server.name).toBe('Operations');
    expect(dashboardEditorReducer(edited, { type: 'cancel' }).draft).toEqual(dashboard);
  });

  it('replaces the snapshot and clears dirty state only after a successful save', () => {
    const edited = dashboardEditorReducer(createDashboardEditorState(dashboard), {
      type: 'rename',
      name: 'Saved name',
      description: null,
    });
    const saved = dashboardEditorReducer(edited, {
      type: 'save-succeeded',
      dashboard: { ...edited.draft, revision: 2 },
    });

    expect(saved.server.revision).toBe(2);
    expect(saved.dirty).toBe(false);
    expect(saved.status).toBe('idle');
  });

  it('retains the local draft when save conflicts', () => {
    const edited = dashboardEditorReducer(createDashboardEditorState(dashboard), {
      type: 'rename',
      name: 'Keep me',
      description: null,
    });
    const conflicted = dashboardEditorReducer(edited, {
      type: 'save-failed',
      message: 'Dashboard revision conflict.',
      conflict: true,
    });

    expect(conflicted.draft.name).toBe('Keep me');
    expect(conflicted.status).toBe('conflict');
    expect(conflicted.dirty).toBe(true);
  });

  it('moves filter placement without deleting mappings and replaces mapping scope explicitly', () => {
    const filter = {
      id: 'filter-1',
      slug: 'date',
      label: 'Date',
      semanticType: 'DATE_PICKER' as const,
      operator: 'ALL_OPTIONS',
      defaultValue: null,
      required: false,
      multiple: false,
      valuesSource: null,
      placement: { kind: 'TOP_OF_PAGE' as const },
      order: 0,
    };
    const withFilter = {
      ...dashboard,
      filters: [filter],
      mappings: [
        {
          filterId: 'filter-1',
          cardId: 'card-1',
          target: { kind: 'FIELD' as const, fieldId: 'brands.created_at' },
        },
      ],
    };
    const moved = dashboardEditorReducer(createDashboardEditorState(withFilter), {
      type: 'update-filter',
      filter: { ...filter, placement: { kind: 'INLINE_CARD', cardId: 'card-1' } },
    });
    expect(moved.draft.mappings).toEqual(withFilter.mappings);

    const remapped = dashboardEditorReducer(moved, {
      type: 'replace-filter-mappings',
      filterId: 'filter-1',
      mappings: [],
    });
    expect(remapped.draft.mappings).toEqual([]);
    expect(remapped.draft.filters[0]?.placement).toEqual({ kind: 'INLINE_CARD', cardId: 'card-1' });
  });

  it('removes a tab atomically with its cards and mappings while preserving the filter at top level', () => {
    const tabbed = {
      ...dashboard,
      cards: [
        {
          id: 'card-1',
          tabId: 'tab-1',
          kind: 'CHART' as const,
          chartId: 'chart-1',
          chartRevisionNumber: 1,
          visualizationOverrides: {},
          geometry: { x: 0, y: 0, width: 12, height: 6 },
        },
      ],
      filters: [
        {
          id: 'filter-1',
          slug: 'date',
          label: 'Date',
          semanticType: 'DATE_PICKER' as const,
          operator: 'ALL_OPTIONS',
          defaultValue: null,
          required: false,
          multiple: false,
          valuesSource: null,
          placement: { kind: 'INLINE_CARD' as const, cardId: 'card-1' },
          order: 0,
        },
      ],
      mappings: [
        {
          filterId: 'filter-1',
          cardId: 'card-1',
          target: { kind: 'FIELD' as const, fieldId: 'brands.created_at' },
        },
      ],
    };
    const removed = dashboardEditorReducer(createDashboardEditorState(tabbed), {
      type: 'remove-tab',
      tabId: 'tab-1',
    });
    expect(removed.draft.cards).toEqual([]);
    expect(removed.draft.mappings).toEqual([]);
    expect(removed.draft.filters[0]?.placement).toEqual({ kind: 'TOP_OF_PAGE' });
  });
});

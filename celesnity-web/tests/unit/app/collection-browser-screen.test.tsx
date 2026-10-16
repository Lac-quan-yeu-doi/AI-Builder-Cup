// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionBrowserScreen } from '@/app/(workspace)/analytics/_components/collection-browser-screen';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);
afterEach(() => useAnalyticsRecentsStore.getState().clear());

const makeCollection = (
  id: string,
  name: string,
  parentId: string | null,
  kind: 'ROOT' | 'PERSONAL' | 'COLLECTION' = 'COLLECTION',
) => ({
  id,
  organizationId: 'org-1',
  parentId,
  name,
  description: null,
  kind,
  access: 'CURATE' as const,
  chartCount: 0,
  archivedAt: null,
  children: [],
});

const collections = [
  makeCollection('root-1', 'Our Analytics', null, 'ROOT'),
  makeCollection('finance-1', 'Finance', 'root-1'),
  makeCollection('personal-1', 'Personal', null, 'PERSONAL'),
];

const makeChart = (id: string, title: string, collectionId: string, updatedAt: string) => ({
  id,
  collectionId,
  title,
  description: `What ${title} shows`,
  provenance: 'CHAT' as const,
  currentRevisionNumber: 1,
  updatedAt,
});

const charts = [
  makeChart('chart-1', 'Orders by brand', 'finance-1', '2026-09-14T08:00:00.000Z'),
  makeChart('chart-2', 'Margin trend', 'finance-1', '2026-09-12T08:00:00.000Z'),
  makeChart('chart-3', 'My scratch query', 'personal-1', '2026-09-10T08:00:00.000Z'),
];

const dashboards = [
  {
    id: 'dashboard-1',
    collectionId: 'finance-1',
    name: 'Operations overview',
    description: 'Everything ops looks at',
    revision: 1,
    updatedAt: '2026-09-15T09:00:00.000Z',
  },
];

const handlers = () => ({
  onCreate: vi.fn().mockResolvedValue(true),
  onRename: vi.fn().mockResolvedValue(true),
  onMove: vi.fn().mockResolvedValue(true),
  onArchive: vi.fn().mockResolvedValue(true),
  onCreateDashboard: vi.fn().mockResolvedValue(true),
});

function renderLibrary(overrides: Record<string, unknown> = {}) {
  return renderUi(
    <CollectionBrowserScreen
      collections={collections}
      charts={charts}
      dashboards={dashboards}
      error={null}
      {...handlers()}
      {...overrides}
    />,
  );
}

describe('CollectionBrowserScreen', () => {
  it('titles the page for the area, not for whichever container is open', () => {
    renderLibrary({ selectedCollectionId: 'personal-1' });

    // The heading used to be the open collection's name — a container's label,
    // repeated from the rail beside it and the nav beside that.
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /personal collection/i })).toBeNull();
  });

  it('lists charts and dashboards together, each naming its collection', () => {
    renderLibrary();

    const list = screen.getByRole('link', { name: /Orders by brand/ });
    expect(list).toBeTruthy();
    expect(screen.getByRole('link', { name: /Operations overview/ })).toBeTruthy();
    // Naming the collection is only possible once it stops being the page.
    expect(screen.getAllByText('Finance').length).toBeGreaterThan(0);
  });

  it('counts what each collection holds, nesting included', () => {
    renderLibrary();

    const scope = screen.getByRole('navigation', { name: 'Filter by collection' });
    // Shared holds nothing directly; Finance under it holds three.
    expect(within(scope).getByRole('link', { name: /Shared 3/ })).toBeTruthy();
    expect(within(scope).getByRole('link', { name: /Finance 3/ })).toBeTruthy();
    expect(within(scope).getByRole('link', { name: /Everything 4/ })).toBeTruthy();
  });

  it('narrows to a collection without becoming a different page', () => {
    renderLibrary({ selectedCollectionId: 'personal-1' });

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /My scratch query/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Orders by brand/ })).toBeNull();
  });

  it('filters by type', () => {
    renderLibrary();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Dashboards' }));
    expect(screen.getByRole('link', { name: /Operations overview/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Orders by brand/ })).toBeNull();
  });

  it('leads with what this browser opened last', () => {
    renderLibrary({ recentIds: ['chart-3', 'dashboard-1'] });

    const recent = screen.getByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('link', { name: /My scratch query/ })).toBeTruthy();
    expect(within(recent).getByRole('link', { name: /Operations overview/ })).toBeTruthy();
  });

  it('hides the recent row when there is nothing to recall', () => {
    renderLibrary();

    expect(screen.queryByRole('region', { name: 'Recent' })).toBeNull();
  });

  it('hides the filter until the library is big enough to need one', () => {
    const { rerender } = renderLibrary();
    expect(screen.queryByLabelText('Search charts and dashboards')).toBeNull();

    rerender(
      <CollectionBrowserScreen
        collections={collections}
        charts={Array.from({ length: 12 }, (_, index) =>
          makeChart(`bulk-${index}`, `Chart ${index}`, 'finance-1', '2026-09-01T08:00:00.000Z'),
        )}
        dashboards={dashboards}
        error={null}
        {...handlers()}
      />,
    );
    expect(screen.getByLabelText('Search charts and dashboards')).toBeTruthy();
  });

  it('offers every way to create from one menu', () => {
    renderLibrary();

    fireEvent.keyDown(screen.getByRole('button', { name: /New/ }), { key: 'ArrowDown' });
    for (const item of ['Question', 'SQL query', 'Dashboard', 'Collection']) {
      expect(screen.getByRole('menuitem', { name: item })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('menuitem', { name: 'Collection' }));
    expect(screen.getByRole('dialog', { name: 'Create a collection' })).toBeTruthy();
  });

  it('creates dashboards from the New menu', () => {
    renderLibrary();

    fireEvent.keyDown(screen.getByRole('button', { name: /New/ }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dashboard' }));

    expect(screen.getByRole('dialog', { name: 'New dashboard' })).toBeTruthy();
    expect(screen.getByLabelText('Dashboard name')).toBeTruthy();
    expect(screen.getByLabelText('Dashboard description')).toBeTruthy();
  });

  it('offers a way forward when a scope is empty', () => {
    renderLibrary({ charts: [], dashboards: [] });

    expect(screen.getByRole('heading', { name: 'This collection is empty' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Question/ })).toBeTruthy();
  });
});

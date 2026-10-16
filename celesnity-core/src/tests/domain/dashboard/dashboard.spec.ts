import {
  createDashboard,
  removeDashboardCard,
  removeDashboardFilter,
  validateDashboard,
  type Dashboard,
} from '@domain/dashboard/models/dashboard';

describe('Dashboard aggregate', () => {
  it('creates a trimmed dashboard with one initial tab and revision one', () => {
    const dashboard = createDashboard({
      id: 'dashboard-1',
      organizationId: 'organization-1',
      collectionId: 'collection-1',
      title: '  Executive overview  ',
      description: null,
      createdByIdentityId: 'identity-1',
      initialTabId: 'tab-1',
      now: '2026-09-05T15:00:00.000Z',
    });

    expect(dashboard).toMatchObject({
      id: 'dashboard-1',
      title: 'Executive overview',
      revision: 1,
      tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
      cards: [],
      filters: [],
      mappings: [],
    });
  });

  it('rejects a blank dashboard title', () => {
    expect(() => validateDashboard(validDashboard({ title: '   ' }))).toThrow('DASHBOARD_INVALID');
  });

  it('rejects a dashboard without a tab', () => {
    expect(() => validateDashboard(validDashboard({ tabs: [] }))).toThrow('DASHBOARD_INVALID');
  });

  it.each([
    ['tab', { tabs: [tab('tab-1', 0), tab('tab-1', 1)] }],
    ['card', { cards: [chartCard('card-1'), chartCard('card-1')] }],
    ['filter', { filters: [filter('filter-1', 'region'), filter('filter-1', 'country')] }],
  ])('rejects duplicate %s identifiers', (_kind, override) => {
    expect(() => validateDashboard(validDashboard(override))).toThrow('DASHBOARD_INVALID');
  });

  it('rejects duplicate filter slugs', () => {
    expect(() =>
      validateDashboard(
        validDashboard({
          filters: [filter('filter-1', 'order-date'), filter('filter-2', 'order-date')],
        }),
      ),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('rejects a card whose tab is outside the aggregate', () => {
    expect(() =>
      validateDashboard(validDashboard({ cards: [chartCard('card-1', 'missing-tab')] })),
    ).toThrow('DASHBOARD_INVALID');
  });

  it.each([
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: -1, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: 0 },
    { x: 23, y: 0, width: 2, height: 1 },
  ])('rejects invalid 24-column geometry %j', (geometry) => {
    expect(() =>
      validateDashboard(validDashboard({ cards: [{ ...chartCard('card-1'), geometry }] })),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('rejects a chart card without a chart reference at runtime', () => {
    expect(() =>
      validateDashboard(
        validDashboard({
          cards: [{ ...chartCard('card-1'), chartId: '' }],
        }),
      ),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('rejects a content card with an empty required payload', () => {
    expect(() =>
      validateDashboard(
        validDashboard({
          cards: [
            {
              id: 'card-1',
              tabId: 'tab-1',
              kind: 'HEADING',
              geometry: { x: 0, y: 0, width: 24, height: 1 },
              content: { text: '   ' },
            },
          ],
        }),
      ),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('rejects executable link protocols in content cards', () => {
    expect(() =>
      validateDashboard(
        validDashboard({
          cards: [
            {
              id: 'link-1',
              tabId: 'tab-1',
              kind: 'LINK',
              geometry: { x: 0, y: 0, width: 12, height: 3 },
              content: { label: 'Unsafe', url: 'javascript:alert(1)' },
            },
          ],
        }),
      ),
    ).toThrow('DASHBOARD_INVALID');
  });

  it('rejects filter placements and mappings that reference missing aggregate members', () => {
    const dashboard = validDashboard({
      cards: [chartCard('card-1')],
      filters: [
        {
          ...filter('filter-1', 'region'),
          placement: { kind: 'INLINE_CARD', cardId: 'missing-card' },
        },
      ],
      mappings: [
        {
          filterId: 'missing-filter',
          cardId: 'card-1',
          target: { kind: 'FIELD', fieldId: 'catalog-field-1' },
        },
      ],
    });

    expect(() => validateDashboard(dashboard)).toThrow('DASHBOARD_INVALID');
  });

  it('moves an inline filter to the top and removes card mappings when its card is removed', () => {
    const dashboard = validDashboard({
      cards: [chartCard('card-1'), chartCard('card-2')],
      filters: [
        {
          ...filter('filter-1', 'region'),
          placement: { kind: 'INLINE_CARD', cardId: 'card-1' },
        },
      ],
      mappings: [
        {
          filterId: 'filter-1',
          cardId: 'card-1',
          target: { kind: 'FIELD', fieldId: 'catalog-field-1' },
        },
        {
          filterId: 'filter-1',
          cardId: 'card-2',
          target: { kind: 'FIELD', fieldId: 'catalog-field-2' },
        },
      ],
    });

    const updated = removeDashboardCard(dashboard, 'card-1');

    expect(updated.cards.map((card) => card.id)).toEqual(['card-2']);
    expect(updated.filters[0]?.placement).toEqual({ kind: 'TOP_OF_PAGE' });
    expect(updated.mappings).toEqual([
      {
        filterId: 'filter-1',
        cardId: 'card-2',
        target: { kind: 'FIELD', fieldId: 'catalog-field-2' },
      },
    ]);
  });

  it('removes a filter and every mapping owned by it', () => {
    const dashboard = validDashboard({
      cards: [chartCard('card-1')],
      filters: [filter('filter-1', 'region'), filter('filter-2', 'status')],
      mappings: [
        {
          filterId: 'filter-1',
          cardId: 'card-1',
          target: { kind: 'FIELD', fieldId: 'catalog-field-1' },
        },
        {
          filterId: 'filter-2',
          cardId: 'card-1',
          target: { kind: 'FIELD', fieldId: 'catalog-field-2' },
        },
      ],
    });

    const updated = removeDashboardFilter(dashboard, 'filter-1');

    expect(updated.filters.map((item) => item.id)).toEqual(['filter-2']);
    expect(updated.mappings.map((item) => item.filterId)).toEqual(['filter-2']);
  });
});

function validDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'dashboard-1',
    organizationId: 'organization-1',
    collectionId: 'collection-1',
    title: 'Executive overview',
    description: null,
    revision: 1,
    tabs: [tab('tab-1', 0)],
    cards: [],
    filters: [],
    mappings: [],
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T15:00:00.000Z',
    updatedAt: '2026-09-05T15:00:00.000Z',
    ...overrides,
  };
}

function tab(id: string, order: number) {
  return { id, name: `Tab ${order + 1}`, order };
}

function chartCard(id: string, tabId = 'tab-1') {
  return {
    id,
    tabId,
    kind: 'CHART' as const,
    chartId: 'chart-1',
    chartRevisionNumber: 1,
    visualizationOverrides: {},
    geometry: { x: 0, y: 0, width: 12, height: 6 },
  };
}

function filter(id: string, slug: string) {
  return {
    id,
    slug,
    label: slug,
    semanticType: 'TEXT_CATEGORY' as const,
    operator: 'IS',
    defaultValue: null,
    required: false,
    multiple: false,
    valuesSource: null,
    placement: { kind: 'TOP_OF_PAGE' as const },
    order: 0,
  };
}

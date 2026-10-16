import { ExecuteDashboardUseCase } from '@application/dashboard/execute-dashboard.use-case';
import type { IDashboardCardExecutor } from '@application/dashboard/interfaces/i-dashboard-card-executor';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { Dashboard } from '@domain/dashboard/models/dashboard';

describe('ExecuteDashboardUseCase', () => {
  it('runs only cards affected by changed filters and retains per-card states', async () => {
    const executor: jest.Mocked<IDashboardCardExecutor> = {
      execute: jest.fn().mockResolvedValue({ state: 'SUCCESS', result: { rows: [[1]] } }),
    };
    const useCase = new ExecuteDashboardUseCase(repository(dashboard()), authorization(), executor);

    const result = await useCase.execute({
      principal: { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false },
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: { region: 'EU' },
      changedFilterIds: ['filter-1'],
    });

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        chartId: 'chart-1',
        filters: [
          expect.objectContaining({ value: 'EU', target: { kind: 'FIELD', fieldId: 'field-1' } }),
        ],
      }),
    );
    expect(result.cards).toEqual([
      { cardId: 'card-1', state: 'SUCCESS', result: { rows: [[1]] } },
      { cardId: 'card-2', state: 'UNCHANGED' },
    ]);
  });

  it('blocks only a mapped card when a required filter has no effective value', async () => {
    const executor: jest.Mocked<IDashboardCardExecutor> = { execute: jest.fn() };
    const required = dashboard({ filters: [{ ...dashboard().filters[0]!, required: true }] });
    const result = await new ExecuteDashboardUseCase(
      repository(required),
      authorization(),
      executor,
    ).execute({
      principal: { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false },
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: {},
    });
    expect(result.cards[0]).toEqual({ cardId: 'card-1', state: 'REQUIRES_FILTER' });
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps executor failures local to their card', async () => {
    const executor: jest.Mocked<IDashboardCardExecutor> = {
      execute: jest.fn().mockRejectedValue(new Error('secret SQL')),
    };
    const result = await new ExecuteDashboardUseCase(
      repository(dashboard({ cards: [dashboard().cards[0]!] })),
      authorization(),
      executor,
    ).execute({
      principal: { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false },
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: { region: 'EU' },
    });
    expect(result.cards).toEqual([
      { cardId: 'card-1', state: 'ERROR', message: 'The dashboard card could not be executed.' },
    ]);
  });
});

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'dashboard-1',
    organizationId: 'org-1',
    collectionId: 'collection-1',
    title: 'Operations',
    description: null,
    revision: 1,
    tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
    cards: [chartCard('card-1', 'chart-1'), chartCard('card-2', 'chart-2')],
    filters: [
      {
        id: 'filter-1',
        slug: 'region',
        label: 'Region',
        semanticType: 'TEXT_CATEGORY',
        operator: 'IS',
        defaultValue: null,
        required: false,
        multiple: false,
        valuesSource: null,
        placement: { kind: 'TOP_OF_PAGE' },
        order: 0,
      },
    ],
    mappings: [
      { filterId: 'filter-1', cardId: 'card-1', target: { kind: 'FIELD', fieldId: 'field-1' } },
    ],
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T00:00:00Z',
    updatedAt: '2026-09-05T00:00:00Z',
    ...overrides,
  };
}

function chartCard(id: string, chartId: string) {
  return {
    id,
    tabId: 'tab-1',
    kind: 'CHART' as const,
    chartId,
    chartRevisionNumber: 1,
    visualizationOverrides: {},
    geometry: { x: 0, y: 0, width: 12, height: 6 },
  };
}

function repository(value: Dashboard): IDashboardRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(value),
    listByCollection: jest.fn(),
    saveCompleteDraft: jest.fn(),
    copy: jest.fn(),
    archive: jest.fn(),
  };
}

function authorization(): IDashboardCollectionAuthorizationReader {
  return { requireAccess: jest.fn().mockResolvedValue(undefined) };
}

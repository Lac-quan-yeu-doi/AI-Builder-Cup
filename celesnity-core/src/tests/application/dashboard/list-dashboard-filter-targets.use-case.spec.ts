import { ListDashboardFilterTargetsUseCase } from '@application/dashboard/list-dashboard-filter-targets.use-case';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardFilterTargetReader } from '@application/dashboard/interfaces/i-dashboard-filter-target.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { Dashboard } from '@domain/dashboard/models/dashboard';

describe('ListDashboardFilterTargetsUseCase', () => {
  it('combines authorized chart targets with declared content variables', async () => {
    const dashboard = fixture();
    const repository = {
      findById: jest.fn().mockResolvedValue(dashboard),
    } as unknown as IDashboardRepository;
    const authorization: IDashboardCollectionAuthorizationReader = {
      requireAccess: jest.fn().mockResolvedValue(undefined),
    };
    const reader: IDashboardFilterTargetReader = {
      list: jest.fn().mockResolvedValue([
        {
          cardId: 'card-1',
          targets: [{ kind: 'FIELD', fieldId: 'brands.created_at', semanticType: 'DATE_PICKER' }],
        },
      ]),
    };

    const result = await new ListDashboardFilterTargetsUseCase(
      repository,
      authorization,
      reader,
    ).execute({
      principal: { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false },
      dashboardId: 'dashboard-1',
    });

    expect(reader.list).toHaveBeenCalledWith(
      expect.objectContaining({ cards: [{ cardId: 'card-1', chartId: 'chart-1' }] }),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'card-1' }),
        expect.objectContaining({
          cardId: 'heading-1',
          targets: expect.arrayContaining([
            { kind: 'CONTENT_VARIABLE', variableName: 'region', semanticType: 'TEXT_CATEGORY' },
          ]),
        }),
      ]),
    );
  });

  it('uses draft chart references when previewing targets before save', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(fixture()),
    } as unknown as IDashboardRepository;
    const authorization: IDashboardCollectionAuthorizationReader = {
      requireAccess: jest.fn().mockResolvedValue(undefined),
    };
    const reader: IDashboardFilterTargetReader = {
      list: jest.fn().mockResolvedValue([{ cardId: 'draft-card', targets: [] }]),
    };
    const useCase = new ListDashboardFilterTargetsUseCase(repository, authorization, reader);

    await useCase.execute({
      principal: { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false },
      dashboardId: 'dashboard-1',
      chartCards: [{ cardId: 'draft-card', chartId: 'chart-2' }],
    });

    expect(reader.list).toHaveBeenCalledWith(
      expect.objectContaining({ cards: [{ cardId: 'draft-card', chartId: 'chart-2' }] }),
    );
  });
});

function fixture(): Dashboard {
  return {
    id: 'dashboard-1',
    organizationId: 'org-1',
    collectionId: 'collection-1',
    title: 'Dashboard',
    description: null,
    revision: 1,
    tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
    cards: [
      {
        id: 'card-1',
        tabId: 'tab-1',
        kind: 'CHART',
        chartId: 'chart-1',
        chartRevisionNumber: 1,
        visualizationOverrides: {},
        geometry: { x: 0, y: 0, width: 12, height: 6 },
      },
      {
        id: 'heading-1',
        tabId: 'tab-1',
        kind: 'HEADING',
        content: { text: 'Sales for {{region}}' },
        geometry: { x: 0, y: 6, width: 24, height: 1 },
      },
    ],
    filters: [],
    mappings: [],
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T00:00:00Z',
    updatedAt: '2026-09-05T00:00:00Z',
  };
}

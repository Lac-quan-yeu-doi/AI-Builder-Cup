import type { Request } from 'express';

import type { Dashboard } from '@domain/dashboard/models/dashboard';
import { DashboardController } from '@presentation/dashboard/dashboard.controller';
import type { CopyDashboardDto, SaveDashboardDto } from '@presentation/dashboard/dashboard.dto';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';

describe('DashboardController', () => {
  it('maps create input and the authenticated principal into one use-case call', async () => {
    const fixture = dashboardFixture();
    const create = { execute: jest.fn().mockResolvedValue(fixture) };
    const controller = controllerWith({ create });

    const response = await controller.create(
      {
        name: 'Sales dashboard',
        description: 'Daily sales',
        collection_id: 'collection-1',
      },
      authenticatedRequest(),
    );

    expect(create.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      collectionId: 'collection-1',
      title: 'Sales dashboard',
      description: 'Daily sales',
    });
    expect(response).toMatchObject({
      id: 'dashboard-1',
      organization_id: 'organization-1',
      collection_id: 'collection-1',
      name: 'Sales',
      expected_revision: 1,
      created_by_identity_id: 'identity-1',
    });
  });

  it('lists and loads dashboards inside the authenticated organization', async () => {
    const list = {
      execute: jest.fn().mockResolvedValue([
        {
          id: 'dashboard-1',
          collectionId: 'collection-1',
          title: 'Sales',
          description: null,
          revision: 1,
          updatedAt: '2026-09-05T16:00:00.000Z',
        },
      ]),
    };
    const get = { execute: jest.fn().mockResolvedValue(dashboardFixture()) };
    const controller = controllerWith({ list, get });

    const summaries = await controller.list('collection-1', authenticatedRequest());
    const dashboard = await controller.get('dashboard-1', authenticatedRequest());

    expect(list.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      collectionId: 'collection-1',
    });
    expect(get.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      dashboardId: 'dashboard-1',
    });
    expect(summaries[0]).toMatchObject({ collection_id: 'collection-1', name: 'Sales' });
    expect(dashboard.tabs).toEqual([{ id: 'tab-1', name: 'Tab 1', order: 0 }]);
  });

  it('maps a complete snake_case save draft without accepting tenant identity from the body', async () => {
    const save = { execute: jest.fn().mockResolvedValue(dashboardFixture({ revision: 2 })) };
    const controller = controllerWith({ save });
    const dto = saveDto();

    await controller.save('dashboard-1', dto, authenticatedRequest());

    expect(save.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      dashboardId: 'dashboard-1',
      expectedRevision: 1,
      draft: expect.objectContaining({
        id: 'dashboard-1',
        organizationId: 'organization-1',
        collectionId: 'collection-1',
        title: 'Sales',
        cards: [
          expect.objectContaining({
            kind: 'CHART',
            chartId: 'chart-1',
            chartRevisionNumber: 3,
            geometry: { x: 0, y: 0, width: 12, height: 6 },
          }),
        ],
        filters: [
          expect.objectContaining({
            semanticType: 'DATE_PICKER',
            defaultValue: { preset: 'PREVIOUS_30_DAYS' },
            placement: { kind: 'TOP_OF_PAGE' },
          }),
        ],
        mappings: [
          expect.objectContaining({
            filterId: 'filter-1',
            cardId: 'card-1',
            target: { kind: 'FIELD', fieldId: 'field-created-at' },
          }),
        ],
      }),
    });
  });

  it('copies a retained draft and archives with the authenticated principal', async () => {
    const copy = { execute: jest.fn().mockResolvedValue(dashboardFixture({ id: 'dashboard-2' })) };
    const archive = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = controllerWith({ copy, archive });
    const copyDto: CopyDashboardDto = {
      collection_id: 'collection-2',
      name: 'Sales copy',
      draft: saveDto(),
    };

    await controller.copy('dashboard-1', copyDto, authenticatedRequest());
    await controller.archive('dashboard-1', authenticatedRequest());

    expect(copy.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: dashboardPrincipal,
        sourceDashboardId: 'dashboard-1',
        collectionId: 'collection-2',
        title: 'Sales copy',
        draft: expect.objectContaining({ id: 'dashboard-1', organizationId: 'organization-1' }),
      }),
    );
    expect(archive.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      dashboardId: 'dashboard-1',
    });
  });

  it('executes mapped filters and exposes authorized target metadata through separate use cases', async () => {
    const execute = {
      execute: jest.fn().mockResolvedValue({
        dashboardId: 'dashboard-1',
        tabId: 'tab-1',
        cards: [{ cardId: 'card-1', state: 'SUCCESS', result: { rows: [[1]] } }],
      }),
    };
    const filterTargets = {
      execute: jest.fn().mockResolvedValue([
        {
          cardId: 'card-1',
          targets: [{ kind: 'FIELD', fieldId: 'brands.created_at', semanticType: 'DATE_PICKER' }],
        },
      ]),
    };
    const controller = controllerWith({ execute, filterTargets });

    const execution = await controller.execute(
      'dashboard-1',
      { tab_id: 'tab-1', values: { date: '2026-09-05' }, changed_filter_ids: ['filter-1'] },
      authenticatedRequest(),
    );
    const targets = await controller.filterTargets('dashboard-1', authenticatedRequest());
    const draftTargets = await controller.previewFilterTargets(
      'dashboard-1',
      { cards: [{ card_id: 'draft-card', chart_id: 'chart-2' }] },
      authenticatedRequest(),
    );

    expect(execute.execute).toHaveBeenCalledWith({
      principal: dashboardPrincipal,
      dashboardId: 'dashboard-1',
      tabId: 'tab-1',
      values: { date: '2026-09-05' },
      changedFilterIds: ['filter-1'],
    });
    expect(execution.cards[0]).toMatchObject({ card_id: 'card-1', state: 'SUCCESS' });
    expect(targets.cards[0]).toMatchObject({ card_id: 'card-1' });
    expect(filterTargets.execute).toHaveBeenLastCalledWith({
      principal: dashboardPrincipal,
      dashboardId: 'dashboard-1',
      chartCards: [{ cardId: 'draft-card', chartId: 'chart-2' }],
    });
    expect(draftTargets.cards[0]).toMatchObject({ card_id: 'card-1' });
  });

  it('rejects oversized dashboard filter payloads before execution', async () => {
    const execute = { execute: jest.fn() };
    const controller = controllerWith({ execute });
    const values = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`filter-${index}`, index]),
    );

    await expect(
      controller.execute('dashboard-1', { tab_id: 'tab-1', values }, authenticatedRequest()),
    ).rejects.toMatchObject({ code: 'DASHBOARD_INVALID' });
    expect(execute.execute).not.toHaveBeenCalled();
  });
});

const dashboardPrincipal = {
  organizationId: 'organization-1',
  identityId: 'identity-1',
  isOrganizationAdmin: true,
};

function controllerWith(overrides: Readonly<Record<string, object>>): DashboardController {
  return new DashboardController(
    (overrides.create ?? { execute: jest.fn() }) as never,
    (overrides.get ?? { execute: jest.fn() }) as never,
    (overrides.list ?? { execute: jest.fn() }) as never,
    (overrides.save ?? { execute: jest.fn() }) as never,
    (overrides.copy ?? { execute: jest.fn() }) as never,
    (overrides.archive ?? { execute: jest.fn() }) as never,
    (overrides.execute ?? { execute: jest.fn() }) as never,
    (overrides.filterTargets ?? { execute: jest.fn() }) as never,
  );
}

function authenticatedRequest(): Request {
  const request = {} as Request;
  setAuthenticatedPrincipal(request, {
    identityId: 'identity-1',
    subject: 'subject-1',
    identityTenantId: 'tenant-1',
    organizationId: 'organization-1',
    organizationStatus: 'ACTIVE',
    mfaRequired: false,
    membershipId: 'membership-1',
    role: 'ORG_ADMIN',
    authenticationTime: 1,
    mfaVerified: true,
  });
  return request;
}

function saveDto(): SaveDashboardDto {
  return {
    expected_revision: 1,
    collection_id: 'collection-1',
    name: 'Sales',
    description: null,
    tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
    cards: [
      {
        id: 'card-1',
        tab_id: 'tab-1',
        kind: 'CHART',
        chart_id: 'chart-1',
        chart_revision_number: 3,
        visualization_overrides: { show_legend: false },
        geometry: { x: 0, y: 0, width: 12, height: 6 },
      },
    ],
    filters: [
      {
        id: 'filter-1',
        slug: 'created_at',
        label: 'Date',
        semantic_type: 'DATE_PICKER',
        operator: 'ALL_OPTIONS',
        default_value: { preset: 'PREVIOUS_30_DAYS' },
        required: false,
        multiple: false,
        values_source: null,
        placement: { kind: 'TOP_OF_PAGE' },
        order: 0,
      },
    ],
    mappings: [
      {
        filter_id: 'filter-1',
        card_id: 'card-1',
        target: { kind: 'FIELD', field_id: 'field-created-at' },
      },
    ],
  };
}

function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'dashboard-1',
    organizationId: 'organization-1',
    collectionId: 'collection-1',
    title: 'Sales',
    description: null,
    revision: 1,
    tabs: [{ id: 'tab-1', name: 'Tab 1', order: 0 }],
    cards: [],
    filters: [],
    mappings: [],
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T15:00:00.000Z',
    updatedAt: '2026-09-05T16:00:00.000Z',
    ...overrides,
  };
}

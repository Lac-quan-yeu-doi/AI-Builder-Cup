import { ArchiveDashboardUseCase } from '@application/dashboard/archive-dashboard.use-case';
import { CopyDashboardUseCase } from '@application/dashboard/copy-dashboard.use-case';
import { CreateDashboardUseCase } from '@application/dashboard/create-dashboard.use-case';
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard.use-case';
import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import type {
  ArchiveDashboardRecord,
  IDashboardRepository,
  SaveDashboardRecord,
} from '@application/dashboard/interfaces/i-dashboard.repository';
import { ListDashboardsUseCase } from '@application/dashboard/list-dashboards.use-case';
import { SaveDashboardUseCase } from '@application/dashboard/save-dashboard.use-case';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { Dashboard } from '@domain/dashboard/models/dashboard';

const principal: DashboardPrincipal = {
  organizationId: 'organization-1',
  identityId: 'identity-1',
  isOrganizationAdmin: false,
};

describe('Dashboard application use cases', () => {
  it('creates a dashboard only when the actor can curate its collection', async () => {
    const repository = new InMemoryDashboardRepository();
    const denied = new CollectionAuthorizationFake(['collection-denied']);
    const useCase = new CreateDashboardUseCase(
      repository,
      denied,
      sequenceIds('dashboard-1', 'tab-1'),
      fixedClock,
    );

    await expect(
      useCase.execute({
        principal,
        collectionId: 'collection-denied',
        title: 'Sales',
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_ACCESS_DENIED' });
    expect(repository.values()).toEqual([]);
  });

  it('loads an organization-scoped dashboard only after view authorization', async () => {
    const repository = new InMemoryDashboardRepository([dashboardFixture()]);
    const useCase = new GetDashboardUseCase(repository, new CollectionAuthorizationFake());

    await expect(useCase.execute({ principal, dashboardId: 'dashboard-1' })).resolves.toMatchObject(
      {
        id: 'dashboard-1',
        collectionId: 'collection-1',
      },
    );
    await expect(
      useCase.execute({
        principal: { ...principal, organizationId: 'organization-2' },
        dashboardId: 'dashboard-1',
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_NOT_FOUND' });
  });

  it('lists only dashboards in an authorized collection and organization', async () => {
    const repository = new InMemoryDashboardRepository([
      dashboardFixture(),
      dashboardFixture({ id: 'dashboard-2', collectionId: 'collection-2' }),
      dashboardFixture({ id: 'dashboard-3', organizationId: 'organization-2' }),
    ]);
    const useCase = new ListDashboardsUseCase(repository, new CollectionAuthorizationFake());

    const summaries = await useCase.execute({ principal, collectionId: 'collection-1' });

    expect(summaries.map((dashboard) => dashboard.id)).toEqual(['dashboard-1']);
  });

  it('does not save when any referenced chart is unavailable to the actor', async () => {
    const stored = dashboardFixture();
    const repository = new InMemoryDashboardRepository([stored]);
    const chartReader = new ChartReaderFake(['chart-restricted']);
    const useCase = new SaveDashboardUseCase(
      repository,
      new CollectionAuthorizationFake(),
      chartReader,
      fixedClock,
    );
    const draft = dashboardFixture({
      cards: [
        {
          id: 'card-1',
          tabId: 'tab-1',
          kind: 'CHART',
          chartId: 'chart-restricted',
          chartRevisionNumber: 1,
          visualizationOverrides: {},
          geometry: { x: 0, y: 0, width: 12, height: 6 },
        },
      ],
    });

    await expect(
      useCase.execute({ principal, dashboardId: 'dashboard-1', expectedRevision: 1, draft }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_ACCESS_DENIED' });
    expect(repository.values()).toEqual([stored]);
  });

  it('preserves stored state when the expected revision is stale', async () => {
    const stored = dashboardFixture({ revision: 2, title: 'Current title' });
    const repository = new InMemoryDashboardRepository([stored]);
    const useCase = new SaveDashboardUseCase(
      repository,
      new CollectionAuthorizationFake(),
      new ChartReaderFake(),
      fixedClock,
    );

    await expect(
      useCase.execute({
        principal,
        dashboardId: 'dashboard-1',
        expectedRevision: 1,
        draft: dashboardFixture({ title: 'Stale edit' }),
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_REVISION_CONFLICT' });
    expect(repository.values()[0]?.title).toBe('Current title');
  });

  it('saves a complete valid draft as the next revision', async () => {
    const repository = new InMemoryDashboardRepository([dashboardFixture()]);
    const useCase = new SaveDashboardUseCase(
      repository,
      new CollectionAuthorizationFake(),
      new ChartReaderFake(),
      fixedClock,
    );

    const saved = await useCase.execute({
      principal,
      dashboardId: 'dashboard-1',
      expectedRevision: 1,
      draft: dashboardFixture({ title: 'Updated title' }),
    });

    expect(saved).toMatchObject({ title: 'Updated title', revision: 2 });
    expect(saved.updatedAt).toBe('2026-09-05T16:00:00.000Z');
  });

  it('copies a retained draft with new aggregate-owned identifiers', async () => {
    const source = dashboardFixture({
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
      ],
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
          placement: { kind: 'INLINE_CARD', cardId: 'card-1' },
          order: 0,
        },
      ],
      mappings: [
        {
          filterId: 'filter-1',
          cardId: 'card-1',
          target: { kind: 'FIELD', fieldId: 'catalog-field-1' },
        },
      ],
    });
    const repository = new InMemoryDashboardRepository([source]);
    const useCase = new CopyDashboardUseCase(
      repository,
      new CollectionAuthorizationFake(),
      new ChartReaderFake(),
      sequenceIds('dashboard-copy', 'tab-copy', 'card-copy', 'filter-copy'),
      fixedClock,
    );

    const copied = await useCase.execute({
      principal,
      sourceDashboardId: 'dashboard-1',
      collectionId: 'collection-1',
      title: 'Sales copy',
      draft: source,
    });

    expect(copied).toMatchObject({ id: 'dashboard-copy', title: 'Sales copy', revision: 1 });
    expect(copied.tabs[0]?.id).toBe('tab-copy');
    expect(copied.cards[0]?.id).toBe('card-copy');
    expect(copied.filters[0]?.placement).toEqual({
      kind: 'INLINE_CARD',
      cardId: 'card-copy',
    });
    expect(copied.mappings[0]).toMatchObject({ filterId: 'filter-copy', cardId: 'card-copy' });
    expect(repository.values().find((item) => item.id === 'dashboard-1')).toEqual(source);
  });

  it('archives instead of deleting an authorized dashboard', async () => {
    const repository = new InMemoryDashboardRepository([dashboardFixture()]);
    const useCase = new ArchiveDashboardUseCase(
      repository,
      new CollectionAuthorizationFake(),
      fixedClock,
    );

    await useCase.execute({ principal, dashboardId: 'dashboard-1' });

    expect(repository.values()).toHaveLength(1);
    expect(repository.values()[0]?.archivedAt).toBe('2026-09-05T16:00:00.000Z');
  });
});

class InMemoryDashboardRepository implements IDashboardRepository {
  private readonly dashboards = new Map<string, Dashboard>();

  public constructor(values: readonly Dashboard[] = []) {
    for (const dashboard of values) this.dashboards.set(dashboard.id, dashboard);
  }

  public async create(dashboard: Dashboard): Promise<Dashboard> {
    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  public async findById(organizationId: string, dashboardId: string): Promise<Dashboard | null> {
    const dashboard = this.dashboards.get(dashboardId);
    return dashboard?.organizationId === organizationId ? dashboard : null;
  }

  public async listByCollection(
    organizationId: string,
    collectionId: string,
  ): Promise<readonly Dashboard[]> {
    return this.values().filter(
      (dashboard) =>
        dashboard.organizationId === organizationId &&
        dashboard.collectionId === collectionId &&
        dashboard.archivedAt === null,
    );
  }

  public async saveCompleteDraft(input: SaveDashboardRecord): Promise<Dashboard | null> {
    const current = await this.findById(input.dashboard.organizationId, input.dashboard.id);
    if (current === null || current.revision !== input.expectedRevision) return null;
    this.dashboards.set(input.dashboard.id, input.dashboard);
    return input.dashboard;
  }

  public async copy(dashboard: Dashboard): Promise<Dashboard> {
    return this.create(dashboard);
  }

  public async archive(input: ArchiveDashboardRecord): Promise<void> {
    const dashboard = await this.findById(input.organizationId, input.dashboardId);
    if (dashboard !== null) {
      this.dashboards.set(dashboard.id, { ...dashboard, archivedAt: input.archivedAt });
    }
  }

  public values(): readonly Dashboard[] {
    return [...this.dashboards.values()];
  }
}

class CollectionAuthorizationFake implements IDashboardCollectionAuthorizationReader {
  public constructor(private readonly deniedCollections: readonly string[] = []) {}

  public async requireAccess(
    collectionId: string,
    _principal: DashboardPrincipal,
    _access: 'VIEW' | 'CURATE',
  ): Promise<void> {
    if (this.deniedCollections.includes(collectionId)) throw DashboardError.accessDenied();
  }
}

class ChartReaderFake implements IDashboardChartReader {
  public constructor(private readonly deniedCharts: readonly string[] = []) {}

  public async requireViewableChart(input: {
    readonly chartId: string;
    readonly revisionNumber: number | null;
    readonly principal: DashboardPrincipal;
  }): Promise<void> {
    if (this.deniedCharts.includes(input.chartId)) throw DashboardError.accessDenied();
  }
}

const fixedClock = { now: () => new Date('2026-09-05T16:00:00.000Z') };

function sequenceIds(...values: readonly string[]) {
  let index = 0;
  return {
    next(): string {
      const value = values[index];
      index += 1;
      if (value === undefined) throw new Error('The test ID sequence is exhausted.');
      return value;
    },
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
    updatedAt: '2026-09-05T15:00:00.000Z',
    ...overrides,
  };
}

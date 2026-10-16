import type { Dashboard } from '@domain/dashboard/models/dashboard';
import { PrismaDashboardRepository } from '@infrastructure/prisma/dashboard/prisma-dashboard.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('PrismaDashboardRepository', () => {
  it('loads and maps an organization-scoped aggregate', async () => {
    const prisma = new PrismaDouble(aggregateRow());
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    const dashboard = await repository.findById('organization-1', 'dashboard-1');

    expect(prisma.lastFindWhere).toEqual({ id: 'dashboard-1', organizationId: 'organization-1' });
    expect(dashboard).toEqual(dashboardFixture());
  });

  it('lists active collection-scoped dashboard summaries', async () => {
    const prisma = new PrismaDouble(aggregateRow());
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    const summaries = await repository.listByCollection('organization-1', 'collection-1');

    expect(prisma.lastListWhere).toEqual({
      organizationId: 'organization-1',
      collectionId: 'collection-1',
      archivedAt: null,
    });
    expect(summaries).toEqual([
      {
        id: 'dashboard-1',
        collectionId: 'collection-1',
        title: 'Sales',
        description: null,
        revision: 1,
        updatedAt: '2026-09-05T15:00:00.000Z',
      },
    ]);
  });

  it('creates the complete aggregate inside one transaction', async () => {
    const prisma = new PrismaDouble(null);
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    await expect(repository.create(dashboardFixture())).resolves.toEqual(dashboardFixture());

    expect(prisma.transactionCount).toBe(1);
    expect(prisma.operations).toEqual([
      'dashboard.create',
      'dashboardTab.createMany',
      'dashboardCard.createMany',
      'dashboardFilter.createMany',
      'dashboardFilterMapping.createMany',
    ]);
  });

  it('returns a revision conflict before replacing any child rows', async () => {
    const prisma = new PrismaDouble(aggregateRow());
    prisma.guardedUpdateCount = 0;
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    const saved = await repository.saveCompleteDraft({
      dashboard: { ...dashboardFixture(), revision: 2, title: 'Stale edit' },
      expectedRevision: 1,
    });

    expect(saved).toBeNull();
    expect(prisma.operations).toEqual(['dashboard.updateMany']);
  });

  it('replaces aggregate-owned rows after the guarded revision update', async () => {
    const prisma = new PrismaDouble(aggregateRow());
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    await expect(
      repository.saveCompleteDraft({
        dashboard: { ...dashboardFixture(), revision: 2, title: 'Current edit' },
        expectedRevision: 1,
      }),
    ).resolves.toMatchObject({ title: 'Current edit', revision: 2 });

    expect(prisma.transactionCount).toBe(1);
    expect(prisma.operations).toEqual([
      'dashboard.updateMany',
      'dashboardFilterMapping.deleteMany',
      'dashboardFilter.deleteMany',
      'dashboardCard.deleteMany',
      'dashboardTab.deleteMany',
      'dashboardTab.createMany',
      'dashboardCard.createMany',
      'dashboardFilter.createMany',
      'dashboardFilterMapping.createMany',
    ]);
  });

  it('archives through an organization-scoped update without deleting', async () => {
    const prisma = new PrismaDouble(aggregateRow());
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    await repository.archive({
      organizationId: 'organization-1',
      dashboardId: 'dashboard-1',
      archivedAt: '2026-09-05T16:00:00.000Z',
    });

    expect(prisma.archiveInput).toEqual({
      where: { id: 'dashboard-1', organizationId: 'organization-1' },
      data: {
        archivedAt: new Date('2026-09-05T16:00:00.000Z'),
        updatedAt: new Date('2026-09-05T16:00:00.000Z'),
      },
    });
    expect(prisma.operations).toEqual(['dashboard.updateMany']);
  });

  it('rejects corrupt persisted card JSON at the mapper boundary', async () => {
    const prisma = new PrismaDouble(
      aggregateRow({
        cards: [
          {
            ...aggregateRow().cards[0],
            visualizationOverrides: ['not', 'an', 'object'],
          },
        ],
      }),
    );
    const repository = new PrismaDashboardRepository(prisma as unknown as PrismaService);

    await expect(repository.findById('organization-1', 'dashboard-1')).rejects.toMatchObject({
      code: 'DASHBOARD_INVALID',
    });
  });
});

class PrismaDouble {
  public transactionCount = 0;
  public guardedUpdateCount = 1;
  public operations: string[] = [];
  public lastFindWhere: unknown;
  public lastListWhere: unknown;
  public archiveInput: unknown;

  public readonly client = this.createClient();

  public constructor(private readonly row: ReturnType<typeof aggregateRow> | null) {}

  public async transaction<T>(
    work: (client: ReturnType<PrismaDouble['createClient']>) => Promise<T>,
  ) {
    this.transactionCount += 1;
    return work(this.createClient());
  }

  private createClient() {
    return {
      dashboard: {
        findFirst: async (input: { readonly where: unknown }) => {
          this.lastFindWhere = input.where;
          return this.row;
        },
        findMany: async (input: { readonly where: unknown }) => {
          this.lastListWhere = input.where;
          return this.row ? [this.row] : [];
        },
        create: async () => {
          this.operations.push('dashboard.create');
          return this.row;
        },
        updateMany: async (input: unknown) => {
          this.operations.push('dashboard.updateMany');
          if (isArchiveInput(input)) this.archiveInput = input;
          return { count: this.guardedUpdateCount };
        },
      },
      dashboardTab: delegate(this.operations, 'dashboardTab'),
      dashboardCard: delegate(this.operations, 'dashboardCard'),
      dashboardFilter: delegate(this.operations, 'dashboardFilter'),
      dashboardFilterMapping: delegate(this.operations, 'dashboardFilterMapping'),
    };
  }
}

function delegate(operations: string[], name: string) {
  return {
    createMany: async () => {
      operations.push(`${name}.createMany`);
      return { count: 1 };
    },
    deleteMany: async () => {
      operations.push(`${name}.deleteMany`);
      return { count: 1 };
    },
  };
}

function isArchiveInput(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const value = input as { readonly data?: { readonly archivedAt?: unknown } };
  return value.data?.archivedAt instanceof Date;
}

function dashboardFixture(): Dashboard {
  return {
    id: 'dashboard-1',
    organizationId: 'organization-1',
    collectionId: 'collection-1',
    title: 'Sales',
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
        placement: { kind: 'TOP_OF_PAGE' },
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
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: '2026-09-05T15:00:00.000Z',
    updatedAt: '2026-09-05T15:00:00.000Z',
  };
}

function aggregateRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: 'dashboard-1',
    organizationId: 'organization-1',
    collectionId: 'collection-1',
    title: 'Sales',
    description: null,
    currentRevision: 1,
    createdByIdentityId: 'identity-1',
    archivedAt: null,
    createdAt: new Date('2026-09-05T15:00:00.000Z'),
    updatedAt: new Date('2026-09-05T15:00:00.000Z'),
    tabs: [{ id: 'tab-1', dashboardId: 'dashboard-1', name: 'Tab 1', order: 0 }],
    cards: [
      {
        id: 'card-1',
        dashboardId: 'dashboard-1',
        tabId: 'tab-1',
        kind: 'CHART',
        chartId: 'chart-1',
        chartRevisionNumber: 1,
        x: 0,
        y: 0,
        width: 12,
        height: 6,
        content: null,
        visualizationOverrides: {},
      },
    ],
    filters: [
      {
        id: 'filter-1',
        dashboardId: 'dashboard-1',
        slug: 'region',
        label: 'Region',
        semanticType: 'TEXT_CATEGORY',
        operator: 'IS',
        defaultValue: null,
        required: false,
        multiple: false,
        valuesSource: null,
        placementKind: 'TOP_OF_PAGE',
        placementCardId: null,
        order: 0,
      },
    ],
    mappings: [
      {
        id: 'mapping-1',
        dashboardId: 'dashboard-1',
        filterId: 'filter-1',
        cardId: 'card-1',
        targetKind: 'FIELD',
        target: { fieldId: 'catalog-field-1' },
      },
    ],
    ...overrides,
  };
}

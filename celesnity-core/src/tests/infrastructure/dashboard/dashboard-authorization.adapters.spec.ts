import { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import type { AuditWriter } from '@application/administration/audit-writer';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IChartCollectionRepository } from '@application/chart-collection/interfaces/i-chart-collection.repository';
import type {
  ChartWithRevision,
  ICanonicalChartRepository,
} from '@application/chart/interfaces/i-chart.repository';
import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { ChartCollection } from '@domain/chart-collection/models/chart-collection';
import type { ChartRevision } from '@domain/chart/models/chart';
import { DashboardChartReader } from '@infrastructure/dashboard/dashboard-chart.reader';
import { DashboardCollectionAuthorizationAdapter } from '@infrastructure/dashboard/dashboard-collection-authorization.adapter';

const principal: DashboardPrincipal = {
  organizationId: 'organization-1',
  identityId: 'identity-1',
  isOrganizationAdmin: false,
};

function collectionAuthorization(
  repository: IChartCollectionRepository,
): CollectionAuthorizationService {
  const audit = { write: jest.fn().mockResolvedValue(undefined) } as AuditWriter;
  const contexts = {
    require: () => ({
      organizationId: principal.organizationId,
      identityId: principal.identityId,
      requestId: 'request-test',
    }),
  } as unknown as AuthenticatedContextStore;
  return new CollectionAuthorizationService(repository, audit, contexts);
}

describe('Dashboard authorization adapters', () => {
  it('delegates collection access decisions to the existing collection policy', async () => {
    const repository = new ChartCollectionRepositoryFake('VIEW');
    const adapter = new DashboardCollectionAuthorizationAdapter(
      collectionAuthorization(repository),
    );

    await expect(adapter.requireAccess('collection-1', principal, 'VIEW')).resolves.toBeUndefined();
    await expect(adapter.requireAccess('collection-1', principal, 'CURATE')).rejects.toMatchObject({
      code: 'DASHBOARD_ACCESS_DENIED',
    });
  });

  it('does not reveal whether a collection is missing or merely inaccessible', async () => {
    const repository = new ChartCollectionRepositoryFake('NO_ACCESS', null);
    const adapter = new DashboardCollectionAuthorizationAdapter(
      collectionAuthorization(repository),
    );

    await expect(adapter.requireAccess('missing', principal, 'VIEW')).rejects.toMatchObject({
      code: 'DASHBOARD_ACCESS_DENIED',
    });
  });

  it('accepts an active organization-scoped chart after collection authorization', async () => {
    const repository = new CanonicalChartRepositoryFake(chartWithRevision());
    const collections = new DashboardCollectionAuthorizationFake();
    const reader = new DashboardChartReader(repository, collections);

    await expect(
      reader.requireViewableChart({ chartId: 'chart-1', revisionNumber: null, principal }),
    ).resolves.toBeUndefined();
    expect(collections.requests).toEqual([
      { collectionId: 'collection-1', principal, access: 'VIEW' },
    ]);
  });

  it('accepts a pinned historical chart revision when that revision still exists', async () => {
    const current = chartWithRevision();
    const repository = new CanonicalChartRepositoryFake(current, [
      { ...current.revision, id: 'revision-1', revisionNumber: 1 },
      current.revision,
    ]);
    const reader = new DashboardChartReader(repository, new DashboardCollectionAuthorizationFake());

    await expect(
      reader.requireViewableChart({ chartId: 'chart-1', revisionNumber: 1, principal }),
    ).resolves.toBeUndefined();
  });

  it('rejects missing, archived, cross-organization, and inaccessible charts safely', async () => {
    const cases: readonly (ChartWithRevision | null)[] = [
      null,
      chartWithRevision({ archivedAt: '2026-09-05T17:00:00.000Z' }),
      chartWithRevision({ organizationId: 'organization-2' }),
      chartWithRevision({ collectionId: null }),
    ];

    for (const value of cases) {
      const reader = new DashboardChartReader(
        new CanonicalChartRepositoryFake(value),
        new DashboardCollectionAuthorizationFake(),
      );
      await expect(
        reader.requireViewableChart({ chartId: 'chart-1', revisionNumber: null, principal }),
      ).rejects.toMatchObject({ code: 'DASHBOARD_ACCESS_DENIED' });
    }

    const deniedReader = new DashboardChartReader(
      new CanonicalChartRepositoryFake(chartWithRevision()),
      new DashboardCollectionAuthorizationFake(true),
    );
    await expect(
      deniedReader.requireViewableChart({ chartId: 'chart-1', revisionNumber: null, principal }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_ACCESS_DENIED' });
  });

  it('rejects a pinned revision that is no longer available', async () => {
    const reader = new DashboardChartReader(
      new CanonicalChartRepositoryFake(chartWithRevision(), []),
      new DashboardCollectionAuthorizationFake(),
    );

    await expect(
      reader.requireViewableChart({ chartId: 'chart-1', revisionNumber: 1, principal }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_INVALID' });
  });
});

class ChartCollectionRepositoryFake implements IChartCollectionRepository {
  public constructor(
    private readonly access: 'NO_ACCESS' | 'VIEW' | 'CURATE',
    private readonly collection: ChartCollection | null = collectionFixture(),
  ) {}

  public async findById(): Promise<ChartCollection | null> {
    return this.collection;
  }

  public async effectiveAccess(): Promise<'NO_ACCESS' | 'VIEW' | 'CURATE'> {
    return this.access;
  }

  public async ensurePersonalCollection(): Promise<ChartCollection> {
    throw new Error('Not used by this adapter test.');
  }

  public async create(): Promise<ChartCollection> {
    throw new Error('Not used by this adapter test.');
  }

  public async move(): Promise<ChartCollection> {
    throw new Error('Not used by this adapter test.');
  }

  public async rename(): Promise<ChartCollection> {
    throw new Error('Not used by this adapter test.');
  }

  public async archive(): Promise<void> {
    throw new Error('Not used by this adapter test.');
  }

  public async setGrant(): Promise<void> {
    throw new Error('Not used by this adapter test.');
  }
}

class DashboardCollectionAuthorizationFake {
  public readonly requests: Array<{
    readonly collectionId: string;
    readonly principal: DashboardPrincipal;
    readonly access: 'VIEW' | 'CURATE';
  }> = [];

  public constructor(private readonly denied = false) {}

  public async requireAccess(
    collectionId: string,
    requestedBy: DashboardPrincipal,
    access: 'VIEW' | 'CURATE',
  ): Promise<void> {
    this.requests.push({ collectionId, principal: requestedBy, access });
    if (this.denied) {
      const error = new Error('denied');
      Object.assign(error, { code: 'DASHBOARD_ACCESS_DENIED' });
      throw error;
    }
  }
}

class CanonicalChartRepositoryFake implements ICanonicalChartRepository {
  public constructor(
    private readonly current: ChartWithRevision | null,
    private readonly revisions: readonly ChartRevision[] = current === null
      ? []
      : [current.revision],
  ) {}

  public async findCanonicalById(): Promise<ChartWithRevision | null> {
    return this.current;
  }

  public async listRevisions(): Promise<readonly ChartRevision[]> {
    return this.revisions;
  }

  public async createCanonical(): Promise<ChartWithRevision> {
    throw new Error('Not used by this adapter test.');
  }

  public async updateCanonical(): Promise<ChartWithRevision | null> {
    throw new Error('Not used by this adapter test.');
  }

  public async restoreRevision(): Promise<ChartWithRevision | null> {
    throw new Error('Not used by this adapter test.');
  }

  public async listCanonical(): Promise<readonly []> {
    throw new Error('Not used by this adapter test.');
  }

  public async moveCanonical(): Promise<null> {
    throw new Error('Not used by this adapter test.');
  }

  public async archiveCanonical(): Promise<null> {
    throw new Error('Not used by this adapter test.');
  }
}

function collectionFixture(): ChartCollection {
  return {
    id: 'collection-1',
    organizationId: 'organization-1',
    parentId: null,
    ownerIdentityId: null,
    type: 'COLLECTION',
    name: 'Sales',
    archivedAt: null,
    createdAt: '2026-09-05T15:00:00.000Z',
    updatedAt: '2026-09-05T15:00:00.000Z',
  };
}

function chartWithRevision(
  chartOverrides: Partial<ChartWithRevision['chart']> = {},
): ChartWithRevision {
  return {
    chart: {
      id: 'chart-1',
      runId: null,
      title: 'Orders',
      chartType: 'canonical',
      encodings: {},
      data: [],
      config: {},
      vlSpec: null,
      sql: null,
      status: 'ready',
      errorMessage: null,
      version: 1,
      organizationId: 'organization-1',
      collectionId: 'collection-1',
      ownerIdentityId: 'identity-1',
      description: null,
      provenance: 'MANUAL',
      currentRevisionNumber: 2,
      legacyState: 'NONE',
      archivedAt: null,
      createdAt: '2026-09-05T15:00:00.000Z',
      updatedAt: '2026-09-05T16:00:00.000Z',
      ...chartOverrides,
    },
    revision: {
      id: 'revision-2',
      chartId: 'chart-1',
      revisionNumber: 2,
      queryDefinition: {
        schemaVersion: 1,
        mode: 'NATIVE',
        context: { catalog: 'iceberg', schema: 'analytics' },
        parameters: [],
        sql: 'SELECT COUNT(*) AS count FROM orders',
      },
      visualizationDefinition: {
        schemaVersion: 1,
        type: 'NUMBER',
        roles: { measure: 'count' },
        display: {},
      },
      outputSchema: [{ name: 'count', type: 'BIGINT', family: 'NUMBER' }],
      queryHash: 'hash-2',
      createdByIdentityId: 'identity-1',
      createdAt: '2026-09-05T16:00:00.000Z',
      restoredFromRevisionNumber: null,
    },
  };
}

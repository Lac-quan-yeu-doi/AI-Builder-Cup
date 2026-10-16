import {
  DatabaseServiceMembershipUseCases,
  type ListAvailableDatabaseServicesQuery,
} from '@application/database-service/database-service-membership.use-cases';
import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDatabaseSourceUsageReader } from '@application/database-service/interfaces/i-database-source-usage-reader';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import { ConnectionErrorCode } from '@domain/database-service/errors/connection.errors';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import type { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { FixedClock } from '@tests/support/deterministic-ports';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

const DATASOURCE_A = '11111111-1111-4111-8111-111111111111';
const DATASOURCE_B = '22222222-2222-4222-8222-222222222222';
const DATABASE = 'kasadata';

const view = (id: string, name: string): DatabaseServiceView => ({
  id,
  name,
  databaseNames: [],
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: {},
  summary: [],
  verificationStatus: VerificationStatusValue.UNTESTED,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
});

class MembershipRepositoryDouble implements IDatabaseServiceMembershipRepository {
  public readonly attached: Array<{ id: string; databaseName: string; createdAt: Date }> = [];
  public readonly detached: Array<{ id: string; databaseName: string }> = [];
  public readonly locked: Array<{ id: string; databaseName: string }> = [];
  public existing = true;
  public linkedIds: readonly string[] = [];

  public listDatabaseNames(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  public listDatabaseServiceIds(): Promise<readonly string[]> {
    return Promise.resolve(this.linkedIds);
  }

  public exists(): Promise<boolean> {
    return Promise.resolve(this.existing);
  }

  public hasAny(): Promise<boolean> {
    return Promise.resolve(this.existing);
  }

  public lockExisting(id: string, databaseName: string): Promise<boolean> {
    this.locked.push({ id, databaseName });
    return Promise.resolve(this.existing);
  }

  public attach(id: string, databaseName: string, createdAt: Date): Promise<void> {
    this.attached.push({ id, databaseName, createdAt });
    return Promise.resolve();
  }

  public detach(id: string, databaseName: string): Promise<void> {
    this.detached.push({ id, databaseName });
    return Promise.resolve();
  }
}

class CatalogReaderDouble implements IDatabaseCatalogReader {
  public available = true;

  public exists(): Promise<boolean> {
    return Promise.resolve(this.available);
  }
}

class SourceRepositoryDouble implements IDatabaseServiceRepository {
  public source: DatabaseService | undefined;

  public findById(): Promise<DatabaseService | undefined> {
    return Promise.resolve(this.source);
  }

  public existsByName(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public create(): Promise<void> {
    return Promise.resolve();
  }

  public update(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class ReaderDouble implements IDatabaseServiceReader {
  public readonly listCalls: ListAvailableDatabaseServicesQuery[] = [];
  public page: DatabaseServiceListPage = {
    items: [view(DATASOURCE_A, 'Orders'), view(DATASOURCE_B, 'Brands')],
    page: 1,
    pageSize: 50,
    total: 2,
  };

  public listActive(query: ListAvailableDatabaseServicesQuery): Promise<DatabaseServiceListPage> {
    this.listCalls.push(query);
    return Promise.resolve(this.page);
  }

  public findActiveById(): Promise<DatabaseServiceView | undefined> {
    return Promise.resolve(undefined);
  }
}

class UsageReaderDouble implements IDatabaseSourceUsageReader {
  public pipelines: readonly { readonly id: string; readonly name: string }[] = [];

  public listUsingPipelines(): Promise<readonly { readonly id: string; readonly name: string }[]> {
    return Promise.resolve(this.pipelines);
  }
}

function createHarness() {
  const memberships = new MembershipRepositoryDouble();
  const catalogs = new CatalogReaderDouble();
  const sources = new SourceRepositoryDouble();
  const reader = new ReaderDouble();
  const usage = new UsageReaderDouble();
  const unitOfWork = new FakeUnitOfWork();
  const useCases = new DatabaseServiceMembershipUseCases(
    memberships,
    catalogs,
    sources,
    reader,
    usage,
    unitOfWork,
    new FixedClock(),
  );
  return { useCases, memberships, catalogs, sources, reader, usage, unitOfWork };
}

describe('DatabaseServiceMembershipUseCases', () => {
  it('lists available datasources using an exclusion query for the selected database', async () => {
    const { useCases, reader } = createHarness();

    await expect(
      useCases.listAvailable({
        databaseName: DATABASE,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({ items: expect.any(Array) });
    expect(reader.listCalls[0]).toEqual(
      expect.objectContaining({ databaseName: undefined, excludeDatabaseName: DATABASE }),
    );
  });

  it('rejects attach when the catalog database is absent', async () => {
    const { useCases, catalogs } = createHarness();
    catalogs.available = false;

    await expect(useCases.attach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A })).rejects.toMatchObject({
      code: ConnectionErrorCode.DATABASE_NOT_FOUND,
    });
  });

  it('rejects attach for an absent or archived datasource', async () => {
    const { useCases, sources } = createHarness();
    sources.source = undefined;
    await expect(useCases.attach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A })).rejects.toMatchObject({
      code: ConnectionErrorCode.DATABASE_SERVICE_NOT_FOUND,
    });

    sources.source = { isArchived: true } as unknown as DatabaseService;
    await expect(useCases.attach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A })).rejects.toMatchObject({
      code: ConnectionErrorCode.DATABASE_SERVICE_NOT_FOUND,
    });
  });

  it('allows repeated attach and delegates idempotency to the membership repository', async () => {
    const { useCases, memberships, sources } = createHarness();
    sources.source = { isArchived: false } as unknown as DatabaseService;

    await useCases.attach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A });
    await useCases.attach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A });

    expect(memberships.attached).toHaveLength(2);
  });

  it('ignores a missing membership during detach', async () => {
    const { useCases, memberships, usage } = createHarness();
    memberships.existing = false;

    await useCases.detach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A });

    expect(memberships.detached).toHaveLength(0);
    expect(usage.pipelines).toEqual([]);
  });

  it('blocks detach when pipelines in the selected database use the datasource', async () => {
    const { useCases, usage, memberships } = createHarness();
    usage.pipelines = [{ id: 'pipeline-1', name: 'Orders sync' }];

    await expect(useCases.detach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A })).rejects.toMatchObject({
      code: ConnectionErrorCode.DATASOURCE_USED_BY_PIPELINES,
      details: [{ id: 'pipeline-1', name: 'Orders sync' }],
    });
    expect(memberships.detached).toHaveLength(0);
  });

  it('does not block detach for a pipeline in another database', async () => {
    const { useCases, memberships } = createHarness();

    await useCases.detach({ databaseName: DATABASE, databaseServiceId: DATASOURCE_A });

    expect(memberships.detached).toEqual([{ id: DATASOURCE_A, databaseName: DATABASE }]);
  });
});

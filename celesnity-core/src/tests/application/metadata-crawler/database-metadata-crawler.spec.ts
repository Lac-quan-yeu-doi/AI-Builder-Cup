import { DatabaseMetadataCrawler } from '@application/metadata-crawler/database-metadata-crawler';
import type {
  DatabaseMetadataSource,
  DiscoveredNamespace,
  DiscoveredRelation,
  RelationMetadata,
  DatabaseDiscoveryConfig,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type {
  MetadataChangeCounts,
  MetadataCatalogWriteResult,
  IMetadataCatalogWriter,
  MetadataScopeCounts,
} from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const RUN_ID = '33333333-3333-4333-8333-333333333333';

const discovery: DatabaseDiscoveryConfig = {
  includeViews: true,
  includeMaterializedViews: true,
  includeDdl: false,
  databaseIncludes: [],
  databaseExcludes: [],
  schemaIncludes: [],
  schemaExcludes: [],
  relationIncludes: [],
  relationExcludes: [],
};

const publicScope: DiscoveredNamespace = {
  type: 'SCHEMA',
  name: 'public',
  canonicalPath: 'db=analytics/schema=public',
  nativeIdentifier: 'public',
  deletionScopeKey: 'db=analytics/schema=public',
  properties: {},
};
const restrictedScope: DiscoveredNamespace = {
  ...publicScope,
  name: 'restricted',
  canonicalPath: 'db=analytics/schema=restricted',
  deletionScopeKey: 'db=analytics/schema=restricted',
};
const relation: DiscoveredRelation = {
  namespaceCanonicalPath: publicScope.canonicalPath,
  name: 'orders',
  type: 'TABLE',
  canonicalPath: `${publicScope.canonicalPath}/relation=orders`,
  nativeIdentifier: 'public.orders',
  deletionScopeKey: publicScope.deletionScopeKey,
  properties: {},
};
const detail: RelationMetadata = {
  relation,
  columns: [
    {
      name: 'id',
      ordinalPosition: 1,
      nativeType: 'int8',
      canonicalType: 'BIGINT',
      nullable: false,
      properties: {},
    },
    {
      name: 'total',
      ordinalPosition: 2,
      nativeType: 'numeric',
      canonicalType: 'DECIMAL',
      nullable: false,
      properties: {},
    },
  ],
  constraints: [],
};

class FakeSource implements DatabaseMetadataSource {
  public closeCalls = 0;
  public failRestricted = false;
  public describeError: Error | undefined;

  public async *listNamespaces(): AsyncIterable<DiscoveredNamespace> {
    yield publicScope;
    yield restrictedScope;
  }

  public async *listRelations(scope: DiscoveredNamespace): AsyncIterable<DiscoveredRelation> {
    if (scope === restrictedScope && this.failRestricted) {
      throw new Error('permission denied password=test-password');
    }
    if (scope === publicScope) yield relation;
  }

  public async describeRelation(_relation: DiscoveredRelation): Promise<RelationMetadata> {
    if (this.describeError !== undefined) throw this.describeError;
    return detail;
  }

  public async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class FakeWriter implements IMetadataCatalogWriter {
  public finalizedScopes: string[] = [];
  public failedScopes: string[] = [];

  public async beginScope(): Promise<void> {}

  public async upsertRelationGraph(): Promise<MetadataCatalogWriteResult> {
    return {
      discovered: { databaseCount: 0, schemaCount: 0, relationCount: 1, columnCount: 2 },
      changes: { created: 1, updated: 0, unchanged: 0, deleted: 0 },
    };
  }

  public async completeScope(
    _runId: string,
    scopeKey: string,
    _counts: MetadataScopeCounts,
  ): Promise<MetadataChangeCounts> {
    this.finalizedScopes.push(scopeKey);
    return { created: 0, updated: 0, unchanged: 0, deleted: 0 };
  }

  public async failScope(
    _runId: string,
    scopeKey: string,
    _counts: MetadataScopeCounts,
  ): Promise<void> {
    this.failedScopes.push(scopeKey);
  }
}

function context(source: DatabaseMetadataSource, writer: IMetadataCatalogWriter) {
  return {
    runId: RUN_ID,
    source,
    writer,
    discovery,
    now: NOW,
    signal: new AbortController().signal,
    logger: { info: jest.fn(), warn: jest.fn() },
  };
}

describe('DatabaseMetadataCrawler', () => {
  it('tombstones missing assets only inside successful scopes', async () => {
    const source = new FakeSource();
    source.failRestricted = true;
    const writer = new FakeWriter();
    const crawler = new DatabaseMetadataCrawler();

    const result = await crawler.run(context(source, writer));

    expect(result.status).toBe('PARTIAL');
    expect(writer.finalizedScopes).toEqual([publicScope.deletionScopeKey]);
    expect(writer.failedScopes).toEqual([restrictedScope.deletionScopeKey]);
    expect(writer.finalizedScopes).not.toContain(restrictedScope.deletionScopeKey);
  });

  it('aggregates persisted namespace, relation, and column counts', async () => {
    const source = new FakeSource();
    const writer = new FakeWriter();

    await expect(crawlerResult(source, writer)).resolves.toMatchObject({
      discovery: {
        databaseCount: 0,
        schemaCount: 2,
        relationCount: 1,
        columnCount: 2,
      },
      changes: { created: 1, updated: 0, unchanged: 0, deleted: 0 },
    });
  });

  it('closes the source after discovery throws', async () => {
    const source = new FakeSource();
    source.describeError = new Error('synthetic parse failure');
    const writer = new FakeWriter();
    const crawler = new DatabaseMetadataCrawler();

    await expect(crawler.run(context(source, writer))).resolves.toMatchObject({
      status: 'PARTIAL',
    });
    expect(source.closeCalls).toBe(1);
  });
});

async function crawlerResult(source: DatabaseMetadataSource, writer: IMetadataCatalogWriter) {
  return new DatabaseMetadataCrawler().run(context(source, writer));
}

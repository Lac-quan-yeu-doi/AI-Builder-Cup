import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';
import type {
  SourceColumnSort,
  SourceColumnView,
  SourceConstraintView,
  SourceMetadataPage,
  SourceMetadataPageRequest,
  SourceMetadataSnapshotSummary,
  SourceNamespaceSort,
  SourceNamespaceView,
  SourceRelationSort,
  SourceRelationView,
} from '@application/metadata-crawler/read-models/source-metadata.view';

const EMPTY_SUMMARY: SourceMetadataSnapshotSummary = {
  hasSnapshot: false,
  databaseCount: 0,
  schemaCount: 0,
  relationCount: 0,
  columnCount: 0,
  constraintCount: 0,
};

export class SourceMetadataQueryUseCases {
  public constructor(
    private readonly crawlerReader: IMetadataCrawlerReader,
    private readonly catalogReader: ISourceMetadataCatalogReader,
  ) {}

  public async summary(crawlerId: string): Promise<SourceMetadataSnapshotSummary> {
    const databaseServiceId = await this.requireDatabaseServiceId(crawlerId);
    const summaries = await this.catalogReader.summariesByDatabaseServiceIds([databaseServiceId]);
    return summaries.get(databaseServiceId) ?? EMPTY_SUMMARY;
  }

  public async listNamespaces(
    crawlerId: string,
    query: SourceMetadataPageRequest<SourceNamespaceSort>,
  ): Promise<SourceMetadataPage<SourceNamespaceView>> {
    return this.catalogReader.listNamespaces(await this.requireDatabaseServiceId(crawlerId), query);
  }

  public async listRelations(
    crawlerId: string,
    namespaceId: string,
    query: SourceMetadataPageRequest<SourceRelationSort>,
  ): Promise<SourceMetadataPage<SourceRelationView>> {
    const result = await this.catalogReader.listRelations(
      await this.requireDatabaseServiceId(crawlerId),
      namespaceId,
      query,
    );
    if (result === undefined) throw MetadataCrawlerError.notFound();
    return result;
  }

  public async getRelation(crawlerId: string, relationId: string): Promise<SourceRelationView> {
    const result = await this.catalogReader.findRelation(
      await this.requireDatabaseServiceId(crawlerId),
      relationId,
    );
    if (result === undefined) throw MetadataCrawlerError.notFound();
    return result;
  }

  public async listColumns(
    crawlerId: string,
    relationId: string,
    query: SourceMetadataPageRequest<SourceColumnSort>,
  ): Promise<SourceMetadataPage<SourceColumnView>> {
    const result = await this.catalogReader.listColumns(
      await this.requireDatabaseServiceId(crawlerId),
      relationId,
      query,
    );
    if (result === undefined) throw MetadataCrawlerError.notFound();
    return result;
  }

  public async listConstraints(
    crawlerId: string,
    relationId: string,
  ): Promise<readonly SourceConstraintView[]> {
    const result = await this.catalogReader.listConstraints(
      await this.requireDatabaseServiceId(crawlerId),
      relationId,
    );
    if (result === undefined) throw MetadataCrawlerError.notFound();
    return result;
  }

  public async requireDatabaseServiceId(crawlerId: string): Promise<string> {
    const crawler = await this.crawlerReader.findById(crawlerId);
    if (crawler === undefined) throw MetadataCrawlerError.notFound();
    return crawler.databaseServiceId;
  }
}

export { EMPTY_SUMMARY };

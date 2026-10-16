import type {
  SourceColumn,
  SourceColumnSort,
  SourceConstraint,
  SourceMetadataPage,
  SourceMetadataPageQuery,
  SourceMetadataSnapshotSummary,
  SourceNamespace,
  SourceNamespaceSort,
  SourceRelation,
  SourceRelationSort,
} from '@/src/entities/models/source-metadata';

export interface SourceMetadataRepository {
  getSummary(crawlerId: string): Promise<SourceMetadataSnapshotSummary>;
  listNamespaces(
    crawlerId: string,
    query: SourceMetadataPageQuery<SourceNamespaceSort>,
  ): Promise<SourceMetadataPage<SourceNamespace>>;
  listRelations(
    crawlerId: string,
    namespaceId: string,
    query: SourceMetadataPageQuery<SourceRelationSort>,
  ): Promise<SourceMetadataPage<SourceRelation>>;
  getRelation(crawlerId: string, relationId: string): Promise<SourceRelation>;
  listColumns(
    crawlerId: string,
    relationId: string,
    query: SourceMetadataPageQuery<SourceColumnSort>,
  ): Promise<SourceMetadataPage<SourceColumn>>;
  listConstraints(crawlerId: string, relationId: string): Promise<readonly SourceConstraint[]>;
}

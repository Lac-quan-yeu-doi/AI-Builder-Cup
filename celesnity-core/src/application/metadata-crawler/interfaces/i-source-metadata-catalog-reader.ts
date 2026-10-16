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

export interface ISourceMetadataCatalogReader {
  summariesByDatabaseServiceIds(
    databaseServiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, SourceMetadataSnapshotSummary>>;
  listNamespaces(
    databaseServiceId: string,
    query: SourceMetadataPageRequest<SourceNamespaceSort>,
  ): Promise<SourceMetadataPage<SourceNamespaceView>>;
  listRelations(
    databaseServiceId: string,
    namespaceId: string,
    query: SourceMetadataPageRequest<SourceRelationSort>,
  ): Promise<SourceMetadataPage<SourceRelationView> | undefined>;
  findRelation(
    databaseServiceId: string,
    relationId: string,
  ): Promise<SourceRelationView | undefined>;
  listColumns(
    databaseServiceId: string,
    relationId: string,
    query: SourceMetadataPageRequest<SourceColumnSort>,
  ): Promise<SourceMetadataPage<SourceColumnView> | undefined>;
  listConstraints(
    databaseServiceId: string,
    relationId: string,
  ): Promise<readonly SourceConstraintView[] | undefined>;
}

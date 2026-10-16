import type { SourceMetadataRepository } from '@/src/application/repositories/source-metadata.repository.interface';
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

export interface SourceMetadataUseCases {
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

export const createSourceMetadataUseCases = (
  repository: SourceMetadataRepository,
): SourceMetadataUseCases => ({
  getSummary: (crawlerId) => repository.getSummary(crawlerId),
  listNamespaces: (crawlerId, query) => repository.listNamespaces(crawlerId, query),
  listRelations: (crawlerId, namespaceId, query) =>
    repository.listRelations(crawlerId, namespaceId, query),
  getRelation: (crawlerId, relationId) => repository.getRelation(crawlerId, relationId),
  listColumns: (crawlerId, relationId, query) =>
    repository.listColumns(crawlerId, relationId, query),
  listConstraints: (crawlerId, relationId) => repository.listConstraints(crawlerId, relationId),
});

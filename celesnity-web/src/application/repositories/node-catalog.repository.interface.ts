import type {
  NodeCategory,
  NodeCategoryDefinition,
  NodeDefinition,
  NodeDefinitionSummary,
} from '@/src/entities/models/node-definition';

export interface ListNodeDefinitionsQuery {
  readonly category?: NodeCategory;
  readonly keyword?: string;
  readonly pageSize?: number;
}

export interface NodeCatalogRepository {
  listCategories(): Promise<readonly NodeCategoryDefinition[]>;
  listDefinitions(query: ListNodeDefinitionsQuery): Promise<readonly NodeDefinitionSummary[]>;
  getDefinition(nodeType: string): Promise<NodeDefinition>;
}

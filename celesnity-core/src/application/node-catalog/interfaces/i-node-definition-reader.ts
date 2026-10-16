import type { NodeCategory, NodeDefinition } from '@domain/node-catalog/models/node-definition';

export interface NodeDefinitionReadQuery {
  readonly category?: NodeCategory;
  readonly keyword?: string;
  readonly skip: number;
  readonly take: number;
  readonly sortBy: 'label' | 'type';
  readonly sortDirection: 'ASC' | 'DESC';
}

export type NodeDefinitionCountQuery = Pick<NodeDefinitionReadQuery, 'category' | 'keyword'>;

export interface INodeDefinitionReader {
  list(query: NodeDefinitionReadQuery): Promise<readonly NodeDefinition[]>;
  count(query: NodeDefinitionCountQuery): Promise<number>;
  findByType(type: string): Promise<NodeDefinition | undefined>;
}

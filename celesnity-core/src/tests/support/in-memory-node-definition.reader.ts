import type {
  INodeDefinitionReader,
  NodeDefinitionCountQuery,
  NodeDefinitionReadQuery,
} from '@application/node-catalog/interfaces/i-node-definition-reader';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';

export const FIRST_RELEASE_TRANSFORM_TYPES = [
  'CHANGE_SCHEMA',
  'SELECT_FIELDS',
  'DROP_FIELDS',
  'RENAME_FIELD',
  'FILTER',
  'DROP_DUPLICATES',
  'DROP_NULL_FIELDS',
  'REMOVE_NULL_ROWS',
  'FILL_MISSING_VALUES',
  'AGGREGATE',
] as const;

const INPUT = {
  id: 'input',
  label: 'Input',
  dataType: 'DATASET' as const,
  required: true,
  maxConnections: 1,
};
const OUTPUT = {
  id: 'output',
  label: 'Output',
  dataType: 'DATASET' as const,
  required: false,
  maxConnections: null,
};

export const TEST_NODE_DEFINITIONS: readonly NodeDefinition[] = FIRST_RELEASE_TRANSFORM_TYPES.map(
  (type) => ({
    resourceId: `definition:${type}`,
    type,
    category: 'TRANSFORM',
    label: type
      .split('_')
      .map((part) => `${part[0] ?? ''}${part.slice(1).toLowerCase()}`)
      .join(' '),
    description: `${type.replaceAll('_', ' ')} transformation`,
    iconKey: type.toLowerCase(),
    enabled: true,
    runtimeKind: 'SPARK_DATAFRAME',
    inputPorts: [INPUT],
    outputPorts:
      type === 'FILTER'
        ? [
            { ...OUTPUT, id: 'matched', label: 'Matched' },
            { ...OUTPUT, id: 'rejected', label: 'Rejected' },
          ]
        : [OUTPUT],
    propertyPanel: {
      sections: [
        { id: 'general', title: 'General', fields: [] },
        {
          id: 'transformation',
          title: 'Transformation',
          fields:
            type === 'FILTER'
              ? [
                  {
                    key: 'condition',
                    label: 'Filter condition',
                    component: 'SQL_EDITOR',
                    required: true,
                  },
                ]
              : [],
        },
      ],
    },
  }),
);

export class InMemoryNodeDefinitionReader implements INodeDefinitionReader {
  public constructor(private readonly definitions = TEST_NODE_DEFINITIONS) {}

  public list(query: NodeDefinitionReadQuery): Promise<readonly NodeDefinition[]> {
    const direction = query.sortDirection === 'ASC' ? 1 : -1;
    const values = this.filtered(query)
      .sort((left, right) => left[query.sortBy].localeCompare(right[query.sortBy]) * direction)
      .slice(query.skip, query.skip + query.take);
    return Promise.resolve(values);
  }

  public count(query: NodeDefinitionCountQuery): Promise<number> {
    return Promise.resolve(this.filtered(query).length);
  }

  public findByType(type: string): Promise<NodeDefinition | undefined> {
    return Promise.resolve(this.definitions.find((definition) => definition.type === type));
  }

  private filtered(query: NodeDefinitionCountQuery): NodeDefinition[] {
    const keyword = query.keyword?.toLowerCase();
    return this.definitions
      .filter(
        (definition) => query.category === undefined || definition.category === query.category,
      )
      .filter(
        (definition) =>
          keyword === undefined ||
          [definition.type, definition.label, definition.description].some((value) =>
            value.toLowerCase().includes(keyword),
          ),
      );
  }
}

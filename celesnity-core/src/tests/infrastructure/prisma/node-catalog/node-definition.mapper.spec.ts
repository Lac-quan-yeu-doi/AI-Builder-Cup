import type { Prisma } from '@generated/prisma/client';

import { NodeCatalogErrorCode } from '@domain/node-catalog/errors/node-catalog.errors';
import {
  NodeDefinitionMapper,
  type NodeDefinitionRecord,
} from '@infrastructure/prisma/node-catalog/node-definition.mapper';

function record(overrides: Partial<NodeDefinitionRecord> = {}): NodeDefinitionRecord {
  return {
    type: 'FILTER',
    category: 'TRANSFORM',
    label: 'Filter',
    description: 'Route rows by condition.',
    iconKey: 'filter',
    enabled: true,
    runtimeKind: 'SPARK_DATAFRAME',
    inputPorts: [
      {
        id: 'input',
        label: 'Input',
        dataType: 'DATASET',
        required: true,
        maxConnections: 1,
      },
    ] as Prisma.JsonValue,
    outputPorts: [
      {
        id: 'matched',
        label: 'Matched',
        dataType: 'DATASET',
        required: false,
        maxConnections: null,
      },
    ] as Prisma.JsonValue,
    propertyPanel: {
      sections: [
        {
          id: 'transformation',
          title: 'Transformation',
          fields: [
            {
              key: 'condition',
              label: 'Condition',
              component: 'SQL_EDITOR',
              required: true,
              visibleWhen: { field: 'strategy', equals: 'LITERAL' },
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe('NodeDefinitionMapper', () => {
  const mapper = new NodeDefinitionMapper();

  it('maps stored JSON configuration without changing optional port values', () => {
    expect(mapper.toDomain(record())).toMatchObject({
      type: 'FILTER',
      category: 'TRANSFORM',
      runtimeKind: 'SPARK_DATAFRAME',
      inputPorts: [{ required: true, maxConnections: 1 }],
      outputPorts: [{ id: 'matched', required: false, maxConnections: null }],
      propertyPanel: {
        sections: [
          {
            fields: [
              {
                key: 'condition',
                component: 'SQL_EDITOR',
                required: true,
                visibleWhen: { field: 'strategy', equals: 'LITERAL' },
              },
            ],
          },
        ],
      },
    });
  });

  it.each([
    { category: 'UNKNOWN' },
    { runtimeKind: 'AWS_GLUE' },
    { inputPorts: { id: 'not-an-array' } as Prisma.JsonValue },
    {
      propertyPanel: {
        sections: [{ id: 'x', title: 'x', fields: [{ component: 'UNKNOWN' }] }],
      } as Prisma.JsonValue,
    },
  ])('rejects corrupted persisted configuration %#', (override) => {
    try {
      mapper.toDomain(record(override));
      throw new Error('Expected mapping to fail.');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: NodeCatalogErrorCode.INVALID_CONFIGURATION });
    }
  });
});

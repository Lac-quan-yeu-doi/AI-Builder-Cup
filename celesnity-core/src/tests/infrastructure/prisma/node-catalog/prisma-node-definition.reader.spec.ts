import type { Prisma } from '@generated/prisma/client';

import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { NodeDefinitionRecord } from '@infrastructure/prisma/node-catalog/node-definition.mapper';
import { PrismaNodeDefinitionReader } from '@infrastructure/prisma/node-catalog/prisma-node-definition.reader';

const storedDefinition: NodeDefinitionRecord = {
  type: 'SELECT_FIELDS',
  category: 'TRANSFORM',
  label: 'Select Fields',
  description: 'Keep selected columns.',
  iconKey: 'select_fields',
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
      id: 'output',
      label: 'Output',
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
            key: 'fields',
            label: 'Fields',
            component: 'MULTI_SELECT',
            required: true,
          },
        ],
      },
    ],
  },
};

describe('PrismaNodeDefinitionReader', () => {
  const findMany = jest.fn().mockResolvedValue([storedDefinition]);
  const count = jest.fn().mockResolvedValue(1);
  const findUnique = jest.fn().mockResolvedValue(storedDefinition);
  const prisma = {
    client: { nodeDefinition: { findMany, count, findUnique } },
  } as unknown as PrismaService;
  const reader = new PrismaNodeDefinitionReader(prisma);

  beforeEach(() => {
    findMany.mockClear();
    count.mockClear();
    findUnique.mockClear();
  });

  it('pushes filtering, sorting, and pagination into PostgreSQL', async () => {
    const result = await reader.list({
      category: 'TRANSFORM',
      keyword: 'field',
      skip: 20,
      take: 10,
      sortBy: 'label',
      sortDirection: 'DESC',
    });

    expect(result).toMatchObject([{ type: 'SELECT_FIELDS' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: 'TRANSFORM',
          OR: [
            { type: { contains: 'field', mode: 'insensitive' } },
            { label: { contains: 'field', mode: 'insensitive' } },
            { description: { contains: 'field', mode: 'insensitive' } },
          ],
        },
        orderBy: { label: 'desc' },
        skip: 20,
        take: 10,
      }),
    );
  });

  it('uses the same filters for the pagination count', async () => {
    await expect(reader.count({ category: 'TRANSFORM', keyword: 'field' })).resolves.toBe(1);
    expect(count).toHaveBeenCalledWith({
      where: {
        category: 'TRANSFORM',
        OR: [
          { type: { contains: 'field', mode: 'insensitive' } },
          { label: { contains: 'field', mode: 'insensitive' } },
          { description: { contains: 'field', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('looks up a definition by its stable type', async () => {
    await expect(reader.findByType('SELECT_FIELDS')).resolves.toMatchObject({
      type: 'SELECT_FIELDS',
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'SELECT_FIELDS' } }),
    );
  });
});

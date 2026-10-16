import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiNodeCatalogRepository } from '@/src/infrastructure/repositories/core-api-node-catalog.repository';

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly paths: string[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<TResponse>(path: string): Promise<TResponse> {
    this.paths.push(path);
    return this.responses.shift() as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const meta = { requestId: 'request-1', timestamp: '2026-08-13T00:00:00.000Z' };

const sourceSummary = {
  resourceId: 'connection:connection-1',
  type: 'POSTGRES_SOURCE',
  category: 'SOURCE',
  label: 'analytics-primary',
  description: 'Read data through the saved POSTGRESQL connection.',
  iconKey: 'postgresql',
  enabled: true,
  runtimeKind: 'SPARK_JDBC_SOURCE',
  inputPorts: [],
  outputPorts: [
    { id: 'output', label: 'Output', dataType: 'DATASET', required: false, maxConnections: null },
  ],
  source: {
    connectionId: 'connection-1',
    connectionName: 'analytics-primary',
    dbmsType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {},
    verificationStatus: 'SUCCEEDED',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

describe('CoreApiNodeCatalogRepository', () => {
  it('lists categories from the envelope', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        success: true,
        data: [
          { type: 'TRANSFORM', label: 'Transforms', order: 2 },
          { type: 'SOURCE', label: 'Sources', order: 1 },
        ],
        meta,
      },
    ]);

    const categories = await new CoreApiNodeCatalogRepository(transport).listCategories();

    expect(transport.paths).toEqual(['/node-categories']);
    expect(categories).toEqual([
      { type: 'TRANSFORM', label: 'Transforms', order: 2 },
      { type: 'SOURCE', label: 'Sources', order: 1 },
    ]);
  });

  it('sends the category filter and maps the resource binding', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        success: true,
        data: [sourceSummary],
        pagination: {
          page: 1,
          pageSize: 100,
          totalItems: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        meta,
      },
    ]);

    const definitions = await new CoreApiNodeCatalogRepository(transport).listDefinitions({
      category: 'SOURCE',
      pageSize: 100,
      keyword: ' analytics ',
    });

    expect(transport.paths[0]).toBe(
      '/node-definitions?page=1&pageSize=100&category=SOURCE&keyword=analytics',
    );
    expect(definitions[0]?.source).toEqual({
      connectionId: 'connection-1',
      connectionName: 'analytics-primary',
      dbmsType: 'POSTGRESQL',
      verificationStatus: 'SUCCEEDED',
    });
    // `null` means unbounded, so no cap reaches the canvas.
    expect(definitions[0]?.outputPorts[0]?.maxConnections).toBeUndefined();
  });

  it('reads the property panel from the per-type endpoint', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        success: true,
        data: {
          ...sourceSummary,
          propertyPanel: {
            sections: [
              {
                id: 'source',
                title: 'Source table',
                fields: [
                  { key: 'schemaName', label: 'Schema', component: 'SELECT', required: true },
                  {
                    key: 'tableName',
                    label: 'Table',
                    component: 'SELECT',
                    required: true,
                    dependsOn: ['schemaName'],
                  },
                ],
              },
            ],
          },
        },
        meta,
      },
    ]);

    const definition = await new CoreApiNodeCatalogRepository(transport).getDefinition(
      'POSTGRES_SOURCE',
    );

    expect(transport.paths[0]).toBe('/node-definitions/POSTGRES_SOURCE');
    expect(definition.propertyPanel.sections[0]?.fields[1]?.dependsOn).toEqual(['schemaName']);
  });

  it('rejects a property component the canvas cannot render', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        success: true,
        data: {
          ...sourceSummary,
          propertyPanel: {
            sections: [
              {
                id: 'source',
                title: 'Source table',
                fields: [{ key: 'x', label: 'X', component: 'COLOR_PICKER', required: false }],
              },
            ],
          },
        },
        meta,
      },
    ]);

    await expect(
      new CoreApiNodeCatalogRepository(transport).getDefinition('POSTGRES_SOURCE'),
    ).rejects.toThrow(/unsupported property component/iu);
  });
});

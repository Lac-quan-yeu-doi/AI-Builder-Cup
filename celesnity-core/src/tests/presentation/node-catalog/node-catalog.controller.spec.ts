import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { NodeCatalogController } from '@presentation/node-catalog/node-catalog.controller';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { InMemoryNodeDefinitionReader } from '@tests/support/in-memory-node-definition.reader';
import {
  NodeCatalogConnectionReaderStub,
  NodeCatalogSourceBindingResolverStub,
  nodeCatalogCatalogUseCases,
} from '@tests/support/node-catalog-dependencies';

describe('NodeCatalogController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NodeCatalogController],
      providers: [
        {
          provide: NodeCatalogUseCases,
          useValue: new NodeCatalogUseCases(
            new InMemoryNodeDefinitionReader(),
            new NodeCatalogConnectionReaderStub(),
            nodeCatalogCatalogUseCases(),
            new NodeCatalogSourceBindingResolverStub(),
          ),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the three ordered node categories in the contract envelope', async () => {
    const response = await request(app.getHttpServer() as Server).get('/node-categories');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [
        { type: 'SOURCE', order: 1 },
        { type: 'TRANSFORM', order: 2 },
        { type: 'TARGET', order: 3 },
      ],
      meta: {
        requestId: expect.any(String) as unknown,
        timestamp: expect.any(String) as unknown,
      },
    });
    const body = response.body as unknown as { readonly meta: { readonly requestId: string } };
    expect(response.headers['x-request-id']).toBe(body.meta.requestId);
  });

  it('returns a paginated transformation summary without the property panel', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/node-definitions?category=TRANSFORM&keyword=drop&page=1&pageSize=1&sortBy=label&sortDirection=ASC',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [{ type: 'DROP_DUPLICATES', category: 'TRANSFORM' }],
      pagination: {
        page: 1,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
        hasNext: true,
        hasPrevious: false,
      },
    });
    const body = response.body as unknown as { readonly data: readonly unknown[] };
    expect(body.data[0]).not.toHaveProperty('propertyPanel');
  });

  it('returns the complete filter definition and its two output ports', async () => {
    const response = await request(app.getHttpServer() as Server).get('/node-definitions/filter');

    expect(response.status).toBe(200);
    const body = response.body as unknown as { readonly data: unknown };
    expect(body.data).toMatchObject({
      type: 'FILTER',
      outputPorts: [{ id: 'matched' }, { id: 'rejected' }],
      propertyPanel: {
        sections: [
          { id: 'general' },
          {
            id: 'transformation',
            fields: [{ key: 'condition', component: 'SQL_EDITOR', required: true }],
          },
        ],
      },
    });
  });

  it('returns active saved connections as source entries without credentials', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/node-definitions?category=SOURCE',
    );
    const body = response.body as unknown as {
      readonly data: ReadonlyArray<{
        readonly resourceId: string;
        readonly type: string;
        readonly source: {
          readonly connectionId: string;
          readonly connectionName: string;
          readonly config: Readonly<Record<string, unknown>>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'connection:11111111-1111-4111-8111-111111111111',
          type: 'POSTGRES_SOURCE',
          source: expect.objectContaining({
            connectionId: '11111111-1111-4111-8111-111111111111',
            connectionName: 'Production PostgreSQL',
            config: expect.objectContaining({ databaseName: 'operations' }) as unknown,
          }) as unknown,
        }),
        expect.objectContaining({
          resourceId: 'iceberg-source:iceberg',
          type: 'ICEBERG_SOURCE',
          label: 'Data Catalog',
        }),
      ]),
    );
    expect(body.data).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('returns one generic Iceberg target whose destination is configured on the node', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/node-definitions?category=TARGET',
    );
    const body = response.body as unknown as { readonly data: readonly unknown[] };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({
        resourceId: 'iceberg:iceberg',
        type: 'ICEBERG_TARGET',
        label: 'Iceberg table',
      }),
    ]);
  });

  it('describes create-new and existing-table target strategies', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/node-definitions/ICEBERG_TARGET',
    );
    const body = response.body as unknown as {
      readonly data: { readonly propertyPanel: { readonly sections: readonly unknown[] } };
    };

    expect(response.status).toBe(200);
    expect(body.data.propertyPanel.sections).toEqual([
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ key: 'tableMode', defaultValue: 'EXISTING' }),
          expect.objectContaining({
            key: 'tableName',
            visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
          }),
          expect.objectContaining({
            key: 'newTableName',
            visibleWhen: { field: 'tableMode', equals: 'CREATE_NEW' },
          }),
          expect.objectContaining({
            key: 'writeMode',
            visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
          }),
        ]) as unknown,
      }),
    ]);
  });

  it('rejects unsupported query values before the use case', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/node-definitions?category=UNKNOWN&pageSize=101',
    );

    expect(response.status).toBe(400);
  });

  it('maps an unknown node type to not found', async () => {
    const response = await request(app.getHttpServer() as Server).get('/node-definitions/unknown');

    expect(response.status).toBe(404);
    const body = response.body as unknown as {
      readonly error: { readonly code: string; readonly message: string };
    };
    expect(body.error).toEqual({
      code: 'NODE_DEFINITION_NOT_FOUND',
      message: 'The node definition was not found.',
      details: null,
    });
  });
});

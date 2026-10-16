import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { SourceMetadataQueryUseCases } from '@application/metadata-crawler/source-metadata-query.use-cases';
import { SourceMetadataController } from '@presentation/metadata-crawler/source-metadata.controller';

const CRAWLER_ID = '11111111-1111-4111-8111-111111111111';
const NAMESPACE_ID = '22222222-2222-4222-8222-222222222222';
const RELATION_ID = '33333333-3333-4333-8333-333333333333';

function emptyPage(sortBy: string) {
  return {
    items: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    sort: { field: sortBy, direction: 'asc' as const },
  };
}

describe('SourceMetadataController', () => {
  let app: INestApplication;
  let useCases: {
    summary: jest.Mock;
    listNamespaces: jest.Mock;
    listRelations: jest.Mock;
    getRelation: jest.Mock;
    listColumns: jest.Mock;
    listConstraints: jest.Mock;
  };

  beforeEach(async () => {
    useCases = {
      summary: jest.fn(async () => ({
        hasSnapshot: true,
        databaseCount: 1,
        schemaCount: 2,
        relationCount: 3,
        columnCount: 4,
        constraintCount: 5,
      })),
      listNamespaces: jest.fn(async (_crawlerId, query) => emptyPage(query.sortBy)),
      listRelations: jest.fn(async (_crawlerId, _namespaceId, query) => emptyPage(query.sortBy)),
      getRelation: jest.fn(async () => ({
        id: RELATION_ID,
        namespaceId: NAMESPACE_ID,
        name: 'orders',
        relationType: 'TABLE',
        columnCount: 0,
        properties: {},
      })),
      listColumns: jest.fn(async (_crawlerId, _relationId, query) => emptyPage(query.sortBy)),
      listConstraints: jest.fn(async () => []),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SourceMetadataController],
      providers: [{ provide: SourceMetadataQueryUseCases, useValue: useCases }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('normalizes default namespace query values before invoking the use case', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/metadata-crawlers/${CRAWLER_ID}/metadata/namespaces`,
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
    expect(useCases.listNamespaces).toHaveBeenCalledWith(CRAWLER_ID, {
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });

  it('passes bounded search and descending relation sorting to the backend use case', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/metadata-crawlers/${CRAWLER_ID}/metadata/namespaces/${NAMESPACE_ID}/relations?page=2&pageSize=25&search=%20orders%20&sortBy=columnCount&sortDirection=desc`,
    );

    expect(response.status).toBe(200);
    expect(useCases.listRelations).toHaveBeenCalledWith(CRAWLER_ID, NAMESPACE_ID, {
      page: 2,
      pageSize: 25,
      search: 'orders',
      sortBy: 'columnCount',
      sortDirection: 'desc',
    });
  });

  it.each([
    '/metadata-crawlers/not-a-uuid/metadata/namespaces',
    `/metadata-crawlers/${CRAWLER_ID}/metadata/namespaces?sortBy=unsupported`,
    `/metadata-crawlers/${CRAWLER_ID}/metadata/namespaces?page=0`,
    `/metadata-crawlers/${CRAWLER_ID}/metadata/namespaces?pageSize=201`,
  ])('rejects invalid source metadata query or identifier: %s', async (path) => {
    const response = await request(app.getHttpServer() as Server).get(path);

    expect(response.status).toBe(400);
    expect(useCases.listNamespaces).not.toHaveBeenCalled();
  });

  it('exposes relation detail, columns, constraints, and summary routes', async () => {
    // Keep these requests sequential. Supertest's ephemeral in-memory listener
    // can close one of several concurrent connections before Nest has flushed
    // every response, which makes this route-contract test intermittently fail
    // with ECONNRESET without exercising application behavior.
    const responses = [];
    responses.push(
      await request(app.getHttpServer() as Server).get(
        `/metadata-crawlers/${CRAWLER_ID}/metadata/summary`,
      ),
    );
    responses.push(
      await request(app.getHttpServer() as Server).get(
        `/metadata-crawlers/${CRAWLER_ID}/metadata/relations/${RELATION_ID}`,
      ),
    );
    responses.push(
      await request(app.getHttpServer() as Server).get(
        `/metadata-crawlers/${CRAWLER_ID}/metadata/relations/${RELATION_ID}/columns`,
      ),
    );
    responses.push(
      await request(app.getHttpServer() as Server).get(
        `/metadata-crawlers/${CRAWLER_ID}/metadata/relations/${RELATION_ID}/constraints`,
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(useCases.summary).toHaveBeenCalledWith(CRAWLER_ID);
    expect(useCases.getRelation).toHaveBeenCalledWith(CRAWLER_ID, RELATION_ID);
    expect(useCases.listColumns).toHaveBeenCalledWith(CRAWLER_ID, RELATION_ID, {
      page: 1,
      pageSize: 50,
      sortBy: 'ordinalPosition',
      sortDirection: 'asc',
    });
    expect(useCases.listConstraints).toHaveBeenCalledWith(CRAWLER_ID, RELATION_ID);
  });
});

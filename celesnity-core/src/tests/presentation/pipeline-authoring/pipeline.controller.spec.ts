import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { PipelineAuthoringUseCases } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import type { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import { UnavailablePipelineNodePreviewer } from '@infrastructure/spark/pipeline-authoring/unavailable-pipeline-node.previewer';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { PipelineController } from '@presentation/pipeline-authoring/pipeline.controller';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { InMemoryPipelineRepository } from '@tests/support/in-memory-pipeline.repository';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

const PIPELINE_ID = '00000000-0000-4000-8000-000000000001';

describe('PipelineController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    let sequence = 0;
    const validator = {
      validate: jest.fn((graph: { readonly nodes: readonly unknown[] }) =>
        Promise.resolve(
          graph.nodes.length === 0
            ? {
                valid: false,
                errors: [{ code: 'GRAPH_EMPTY', message: 'The graph has no nodes.' }],
                warnings: [],
              }
            : { valid: true, errors: [], warnings: [] },
        ),
      ),
      validateEdge: jest.fn(() => Promise.resolve({ valid: true, errors: [] })),
    } as unknown as PipelineGraphValidator;
    const repository = new InMemoryPipelineRepository();
    const useCases = new PipelineAuthoringUseCases(
      repository,
      repository,
      validator,
      new UnavailablePipelineNodePreviewer(),
      new FakeUnitOfWork(),
      { now: (): Date => new Date('2026-08-11T10:00:00.000Z') },
      {
        next: (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      },
      { lockAndListMissing: jest.fn().mockResolvedValue([]) },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineController],
      providers: [{ provide: PipelineAuthoringUseCases, useValue: useCases }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
  });

  afterEach(() => app.close());

  it('creates, updates, lists, clones, and archives a pipeline through contract routes', async () => {
    const created = await request(app.getHttpServer() as Server)
      .post('/pipelines')
      .send({ name: 'Customer ETL', graph: { nodes: [], edges: [] } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ success: true, data: { id: PIPELINE_ID, version: 1 } });

    const updated = await request(app.getHttpServer() as Server)
      .put(`/pipelines/${PIPELINE_ID}`)
      .send({
        version: 1,
        name: 'Customer ETL v2',
        graph: {
          nodes: [
            {
              id: 'source',
              definitionType: 'POSTGRES_SOURCE',
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
        },
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ data: { name: 'Customer ETL v2', version: 2 } });

    const listed = await request(app.getHttpServer() as Server).get('/pipelines');
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({
      data: [{ id: PIPELINE_ID, version: 2 }],
      pagination: { totalItems: 1 },
    });
    expect((listed.body as { readonly data: readonly unknown[] }).data[0]).not.toHaveProperty(
      'graph',
    );

    const cloned = await request(app.getHttpServer() as Server)
      .post(`/pipelines/${PIPELINE_ID}/clone`)
      .send({ name: 'Customer ETL Copy' });
    expect(cloned.status).toBe(201);
    expect(cloned.body).toMatchObject({ data: { name: 'Customer ETL Copy', version: 1 } });

    const removed = await request(app.getHttpServer() as Server).delete(
      `/pipelines/${PIPELINE_ID}`,
    );
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');
  });

  it('summarizes the graph on the list route so grouping needs no second fetch', async () => {
    await request(app.getHttpServer() as Server)
      .post('/pipelines')
      .send({
        name: 'Daily output',
        graph: {
          nodes: [
            {
              id: 'source',
              definitionType: 'POSTGRES_SOURCE',
              resourceId: 'connection:svc-1',
              position: { x: 0, y: 0 },
              config: {},
            },
            {
              id: 'target',
              definitionType: 'ICEBERG_TARGET',
              position: { x: 200, y: 0 },
              config: { databaseName: 'nhamay_saigonfood', tableName: 'san_luong_theo_ca' },
            },
          ],
          edges: [],
        },
      });

    const listed = await request(app.getHttpServer() as Server).get('/pipelines');

    expect(listed.status).toBe(200);
    // The summary still withholds the graph; these two fields exist so a client
    // can group pipelines by database without a GET per row.
    expect((listed.body as { readonly data: readonly unknown[] }).data[0]).not.toHaveProperty(
      'graph',
    );
    expect(listed.body).toMatchObject({
      data: [{ targetDatabase: 'nhamay_saigonfood', sourceConnectionIds: ['svc-1'] }],
    });
  });

  it('files a pipeline under the database it was created in, before it has a target', async () => {
    await request(app.getHttpServer() as Server)
      .post('/pipelines')
      .send({
        name: 'Draft in a database',
        databaseName: 'nhamay_saigonfood',
        graph: { nodes: [], edges: [] },
      });

    const listed = await request(app.getHttpServer() as Server).get('/pipelines');

    // Filed and targeted are separate answers: the draft belongs to the
    // database from the moment it is created, and writes nowhere yet.
    expect(listed.body).toMatchObject({
      data: [{ databaseName: 'nhamay_saigonfood', targetDatabase: null }],
    });
  });

  it('reports no target database for a draft that has none yet', async () => {
    await request(app.getHttpServer() as Server)
      .post('/pipelines')
      .send({ name: 'Untargeted draft', graph: { nodes: [], edges: [] } });

    const listed = await request(app.getHttpServer() as Server).get('/pipelines');

    expect(listed.body).toMatchObject({
      data: [{ targetDatabase: null, sourceConnectionIds: [] }],
    });
  });

  it('returns validation findings with HTTP 200', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/pipelines/validate')
      .send({ graph: { nodes: [], edges: [] } });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { valid: false, errors: [{ code: 'GRAPH_EMPTY' }] },
    });
  });

  it('rejects malformed pipeline identifiers before persistence', async () => {
    const response = await request(app.getHttpServer() as Server).get('/pipelines/not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('returns 502 when preview execution has not been configured', async () => {
    await request(app.getHttpServer() as Server)
      .post('/pipelines')
      .send({
        name: 'Customer ETL',
        graph: {
          nodes: [
            {
              id: 'source',
              definitionType: 'POSTGRES_SOURCE',
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
        },
      });
    const response = await request(app.getHttpServer() as Server)
      .post(`/pipelines/${PIPELINE_ID}/nodes/source/preview`)
      .send({ pipelineVersion: 1, limit: 100 });
    expect(response.status).toBe(502);
    expect(
      (response.body as { readonly error: { readonly message: string } }).error.message,
    ).toContain('graph-to-Spark compiler');
  });
});

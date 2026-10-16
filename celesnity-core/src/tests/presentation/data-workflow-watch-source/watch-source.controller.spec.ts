import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';

import { ListWatchSourceCatalogUseCase } from '@application/data-workflow-watch-source/list-watch-source-catalog.use-case';
import { ValidateWatchSourceTriggerUseCase } from '@application/data-workflow-watch-source/validate-watch-source-trigger.use-case';
import { WatchSourceController } from '@presentation/data-workflow-watch-source/watch-source.controller';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';

const routeSourceId = '00000000-0000-4000-8000-000000000001';
const bodySourceId = '00000000-0000-4000-8000-000000000002';

describe('WatchSourceController', () => {
  let app: INestApplication;
  const watchSource = { capabilities: jest.fn(), validate: jest.fn() };
  const catalog = { services: jest.fn(), relations: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [WatchSourceController],
      providers: [
        { provide: ValidateWatchSourceTriggerUseCase, useValue: watchSource },
        { provide: ListWatchSourceCatalogUseCase, useValue: catalog },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use((request: Request, _response: Response, next: NextFunction) => {
      setAuthenticatedPrincipal(request, {
        organizationId: '00000000-0000-4000-8000-000000000010',
        identityId: '00000000-0000-4000-8000-000000000011',
        subject: 'test-subject',
        identityTenantId: 'test-tenant',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: '00000000-0000-4000-8000-000000000012',
        role: 'ORG_ADMIN',
        authenticationTime: 0,
        mfaVerified: true,
        visibleFeatures: null,
      });
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
  });

  afterEach(async () => app.close());

  it('maps a route and Watch Source trigger mismatch to a stable safe 400 response', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post(`/data-workflows/watch-sources/${routeSourceId}/validate`)
      .send({
        trigger: {
          type: 'WATCH_SOURCE',
          mode: 'POLLING',
          databaseServiceId: bodySourceId,
          everySeconds: 600,
          relations: [
            {
              schema: 'public',
              table: 'orders',
              cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
            },
          ],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'WATCH_SOURCE_TRIGGER_MISMATCH',
        message: 'Watch Source trigger does not match the route.',
      },
    });
    expect(watchSource.validate).not.toHaveBeenCalled();
  });

  it('lists verified services and relations through the catalog use case', async () => {
    catalog.services.mockResolvedValue({ data: [], page: 1, pageSize: 50, totalItems: 0 });
    catalog.relations.mockResolvedValue({ data: [], page: 1, pageSize: 50, totalItems: 0 });

    const servicesResponse = await request(app.getHttpServer() as Server)
      .get('/data-workflows/watch-sources/catalog')
      .query({ page: 1, pageSize: 50, search: ' orders ' });
    const relationsResponse = await request(app.getHttpServer() as Server)
      .get(`/data-workflows/watch-sources/catalog/${routeSourceId}/relations`)
      .query({ page: 1, pageSize: 50, search: ' orders ' });

    expect(servicesResponse.status).toBe(200);
    expect(relationsResponse.status).toBe(200);
    expect(catalog.services).toHaveBeenCalledWith(
      { organizationId: expect.any(String), identityId: expect.any(String) },
      expect.objectContaining({ page: 1, pageSize: 50, search: ' orders ' }),
    );
    expect(catalog.relations).toHaveBeenCalledWith(
      { organizationId: expect.any(String), identityId: expect.any(String) },
      routeSourceId,
      expect.objectContaining({ page: 1, pageSize: 50, search: ' orders ' }),
    );
  });
});

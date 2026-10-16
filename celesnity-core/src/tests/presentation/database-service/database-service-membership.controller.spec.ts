import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { DatabaseServiceMembershipUseCases } from '@application/database-service/database-service-membership.use-cases';
import type { DatabaseServiceListPage } from '@application/database-service/read-models/database-service.view';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { DatabaseServiceMembershipController } from '@presentation/database-service/database-service-membership.controller';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const available: DatabaseServiceListPage = {
  items: [
    {
      id: SERVICE_ID,
      name: 'Orders source',
      databaseNames: ['analytics'],
      connectorType: 'POSTGRESQL',
      configSchemaVersion: 1,
      config: { host: 'db.internal' },
      summary: [],
      verificationStatus: VerificationStatusValue.SUCCEEDED,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 50,
  total: 1,
};

class MembershipUseCasesStub {
  public listQuery: unknown;
  public attachCommand: unknown;
  public detachCommand: unknown;

  public listAvailable(query: unknown): Promise<DatabaseServiceListPage> {
    this.listQuery = query;
    return Promise.resolve(available);
  }

  public attach(command: unknown): Promise<void> {
    this.attachCommand = command;
    return Promise.resolve();
  }

  public detach(command: unknown): Promise<void> {
    this.detachCommand = command;
    return Promise.resolve();
  }
}

describe('DatabaseServiceMembershipController', () => {
  let app: INestApplication;
  let useCases: MembershipUseCasesStub;

  beforeEach(async () => {
    useCases = new MembershipUseCasesStub();
    const moduleRef = await Test.createTestingModule({
      controllers: [DatabaseServiceMembershipController],
      providers: [{ provide: DatabaseServiceMembershipUseCases, useValue: useCases }],
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

  it('lists candidates for one catalog database', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/database-services/available')
      .query({ databaseName: 'kasadata', search: 'orders', page: '2' });

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: SERVICE_ID, name: 'Orders source' });
    expect(useCases.listQuery).toEqual(
      expect.objectContaining({ databaseName: 'kasadata', search: 'orders', page: 2 }),
    );
  });

  it('attaches and detaches an existing datasource explicitly', async () => {
    await request(app.getHttpServer() as Server)
      .put(`/database-services/${SERVICE_ID}/memberships/kasadata`)
      .expect(204);
    await request(app.getHttpServer() as Server)
      .delete(`/database-services/${SERVICE_ID}/memberships/kasadata`)
      .expect(204);

    expect(useCases.attachCommand).toEqual({ databaseName: 'kasadata', databaseServiceId: SERVICE_ID });
    expect(useCases.detachCommand).toEqual({ databaseName: 'kasadata', databaseServiceId: SERVICE_ID });
  });
});

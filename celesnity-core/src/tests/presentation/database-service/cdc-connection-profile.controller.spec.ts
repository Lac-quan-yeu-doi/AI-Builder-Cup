import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { CdcConnectionProfileUseCases } from '@application/database-service/cdc-connection-profile.use-cases';
import type { CdcConnectionProfileView } from '@application/database-service/read-models/cdc-connection-profile';
import {
  CdcConnectionSetupMode,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import { CdcConnectionProfileController } from '@presentation/database-service/cdc-connection-profile.controller';

const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const view: CdcConnectionProfileView = {
  id: '22222222-2222-4222-8222-222222222222',
  databaseServiceId: DATABASE_SERVICE_ID,
  connectorType: 'POSTGRESQL',
  endpointSummary: 'db.direct.example.test:5432/postgres',
  setupMode: CdcConnectionSetupMode.EXISTING,
  publicationName: 'celesnity_publication',
  slotName: 'celesnity_slot',
  verificationStatus: CdcConnectionVerificationStatus.UNTESTED,
  revision: 0,
  createdAt: '2026-09-21T02:00:00.000Z',
  updatedAt: '2026-09-21T02:00:00.000Z',
};

class UseCasesStub {
  public putCommand: unknown;
  public get = jest.fn().mockResolvedValue(view);
  public validate = jest.fn().mockResolvedValue(view);
  public remove = jest.fn().mockResolvedValue(undefined);
  public put(command: unknown): Promise<CdcConnectionProfileView> {
    this.putCommand = command;
    return Promise.resolve(view);
  }
}

describe('CdcConnectionProfileController', () => {
  let app: INestApplication;
  let useCases: UseCasesStub;

  beforeEach(async () => {
    useCases = new UseCasesStub();
    const moduleRef = await Test.createTestingModule({
      controllers: [CdcConnectionProfileController],
      providers: [{ provide: CdcConnectionProfileUseCases, useValue: useCases }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it('saves write-only CDC details and returns only the safe profile', async () => {
    const response = await request(app.getHttpServer() as Server)
      .put(`/database-services/${DATABASE_SERVICE_ID}/cdc-connection`)
      .send({
        details: {
          host: 'db.direct.example.test',
          port: 5432,
          databaseName: 'postgres',
          username: 'cdc_user',
          password: 'must-not-return',
        },
        setupMode: CdcConnectionSetupMode.EXISTING,
        publicationName: 'celesnity_publication',
        slotName: 'celesnity_slot',
      });

    expect(response.status).toBe(200);
    expect(useCases.putCommand).toMatchObject({ databaseServiceId: DATABASE_SERVICE_ID });
    expect(JSON.stringify(response.body)).not.toContain('must-not-return');
    expect(response.body.endpointSummary).toBe('db.direct.example.test:5432/postgres');
  });

  it('exposes get, validate, and remove at datasource-scoped paths', async () => {
    expect(
      (
        await request(app.getHttpServer() as Server).get(
          `/database-services/${DATABASE_SERVICE_ID}/cdc-connection`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer() as Server).post(
          `/database-services/${DATABASE_SERVICE_ID}/cdc-connection/validate`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer() as Server).delete(
          `/database-services/${DATABASE_SERVICE_ID}/cdc-connection`,
        )
      ).status,
    ).toBe(204);
  });
});

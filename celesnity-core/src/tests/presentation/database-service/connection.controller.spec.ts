import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import {
  DatabaseServiceUseCases,
  type CreateConnectionCommand,
  type TestUnsavedConnectionCommand,
} from '@application/database-service/database-service.use-cases';
import type { DatabaseServiceView } from '@application/database-service/read-models/database-service.view';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { DatabaseServiceController } from '@presentation/database-service/database-service.controller';

const createdConnection: DatabaseServiceView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'analytics',
  databaseNames: [],
  connectorType: 'TEST_DBMS',
  configSchemaVersion: 7,
  config: {
    endpoint: { host: 'db.internal', port: 15432 },
    mode: 'readonly',
  },
  summary: [],
  verificationStatus: VerificationStatusValue.UNTESTED,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

class DatabaseServiceUseCasesStub {
  public createCommand: CreateConnectionCommand | undefined;
  public testUnsavedCommand: TestUnsavedConnectionCommand | undefined;

  public create(command: CreateConnectionCommand): Promise<DatabaseServiceView> {
    this.createCommand = command;
    return Promise.resolve(createdConnection);
  }

  public testUnsaved(
    command: TestUnsavedConnectionCommand,
  ): Promise<{ readonly status: 'SUCCEEDED'; readonly testedAt: string }> {
    this.testUnsavedCommand = command;
    return Promise.resolve({ status: 'SUCCEEDED', testedAt: '2026-08-08T00:00:00.000Z' });
  }
}

describe('DatabaseServiceController', () => {
  let app: INestApplication;
  let useCases: DatabaseServiceUseCasesStub;

  beforeEach(async () => {
    useCases = new DatabaseServiceUseCasesStub();
    const moduleRef = await Test.createTestingModule({
      controllers: [DatabaseServiceController],
      providers: [
        {
          provide: DatabaseServiceUseCases,
          useValue: useCases,
        },
      ],
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

  it('creates a DBMS-neutral connection from connectorType and details', async () => {
    const details = {
      endpoint: { host: 'db.internal', port: 15432 },
      password: 'must-not-return',
      mode: 'readonly',
    };

    const response = await request(app.getHttpServer() as Server)
      .post('/database-services')
      .send({ name: 'analytics', connectorType: 'TEST_DBMS', details });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'analytics',
      databaseNames: [],
      connectorType: 'TEST_DBMS',
      configSchemaVersion: 7,
      config: {
        endpoint: { host: 'db.internal', port: 15432 },
        mode: 'readonly',
      },
      summary: [],
      verificationStatus: VerificationStatusValue.UNTESTED,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    });
    expect(response.body).not.toHaveProperty('type');
    expect(JSON.stringify(response.body)).not.toContain('must-not-return');
    expect(useCases.createCommand).toEqual({
      name: 'analytics',
      connectorType: 'TEST_DBMS',
      details,
    });
  });

  it('tests DBMS-neutral unsaved details without exposing them in the response', async () => {
    const details = { accessToken: 'must-not-return', endpoint: 'db.internal' };

    const response = await request(app.getHttpServer() as Server)
      .post('/database-service-tests')
      .send({ connectorType: 'TEST_DBMS', details });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'SUCCEEDED',
      testedAt: '2026-08-08T00:00:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toContain('must-not-return');
    expect(useCases.testUnsavedCommand).toEqual({ connectorType: 'TEST_DBMS', details });
  });

  it('passes the initial catalog membership separately from the source connection details', async () => {
    const details = { endpoint: { host: 'db.internal', port: 15432 } };

    const response = await request(app.getHttpServer() as Server)
      .post('/database-services')
      .send({
        name: 'orders-source',
        connectorType: 'TEST_DBMS',
        details,
        initialDatabaseName: 'analytics',
      });

    expect(response.status).toBe(201);
    expect(useCases.createCommand).toEqual({
      name: 'orders-source',
      connectorType: 'TEST_DBMS',
      details,
      initialDatabaseName: 'analytics',
    });
  });
});

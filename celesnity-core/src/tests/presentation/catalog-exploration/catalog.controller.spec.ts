import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type {
  ICatalogReader,
  TablePreview,
  TablePreviewOptions,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';
import {
  Namespace,
  TableMetadata,
  type TableSnapshot,
  type TableSummary,
} from '@domain/catalog-exploration/models/catalog-models';
import type {
  CatalogName,
  NamespaceName,
  TablePath,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';
import { CatalogController } from '@presentation/catalog-exploration/catalog.controller';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';

// These cases are about the writable filter and the HTTP contract, so every
// resource is authorized; access control has its own suite.
const allowAll: CatalogAccessAuthorizer = {
  authorizeCatalog: () =>
    Promise.resolve({ allowed: true, matchedGrantIds: ['test'], reason: 'EXPLICIT_ALLOW' }),
};

class CatalogReaderStub implements ICatalogReader {
  public previewOptions?: TablePreviewOptions;
  public listSchemas(): Promise<readonly Namespace[]> {
    return Promise.resolve([
      Namespace.create('iceberg', 'information_schema'),
      Namespace.create('iceberg', 'system'),
      Namespace.create('iceberg', 'nhamay_saigonfood'),
    ]);
  }

  public listTables(): Promise<readonly TableSummary[]> {
    return Promise.resolve([]);
  }

  public listColumns(path: TablePath): Promise<TableMetadata> {
    return Promise.resolve(
      TableMetadata.create(path.catalog.value, path.schema.value, path.table.value, []),
    );
  }

  public listSnapshots(): Promise<readonly TableSnapshot[]> {
    return Promise.resolve([]);
  }

  public previewTable(
    _path: TablePath,
    _maxRows: number,
    options?: TablePreviewOptions,
  ): Promise<TablePreview> {
    this.previewOptions = options;
    return Promise.resolve({ columns: [], rows: [] });
  }

  public profileTable(): ReturnType<ICatalogReader['profileTable']> {
    return Promise.resolve([]);
  }
}

class CatalogWriterStub implements ICatalogWriter {
  public createNamespace(catalog: CatalogName, namespace: NamespaceName): Promise<Namespace> {
    return Promise.resolve(Namespace.create(catalog.value, namespace.value));
  }
}

function namespaceNames(body: unknown): readonly string[] {
  return (body as readonly { readonly name: string }[]).map((namespace) => namespace.name);
}

describe('CatalogController', () => {
  let app: INestApplication;
  let reader: CatalogReaderStub;

  beforeEach(async () => {
    reader = new CatalogReaderStub();
    const useCases = new CatalogExplorationUseCases(
      reader,
      new CatalogWriterStub(),
      'iceberg',
      100,
      allowAll,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogExplorationUseCases, useValue: useCases }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
  });

  afterEach(() => app.close());

  it('lists every namespace, reserved ones included, by default', async () => {
    const response = await request(app.getHttpServer() as Server).get('/catalogs/iceberg/schemas');

    expect(response.status).toBe(200);
    expect(namespaceNames(response.body)).toEqual([
      'information_schema',
      'system',
      'nhamay_saigonfood',
    ]);
  });

  it('drops the reserved namespaces when the caller asks for writable ones', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/catalogs/iceberg/schemas?writable=true',
    );

    expect(response.status).toBe(200);
    // A picker offering `system` as a pipeline target would be offering a
    // destination the create path rejects.
    expect(namespaceNames(response.body)).toEqual(['nhamay_saigonfood']);
  });

  it('treats any value other than true as unfiltered', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      '/catalogs/iceberg/schemas?writable=1',
    );

    expect(namespaceNames(response.body)).toHaveLength(3);
  });

  it('accepts an optional description when creating a database', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/catalogs/iceberg/schemas')
      .send({ name: 'curated_sales', description: 'Curated sales data' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      catalog: 'iceberg',
      name: 'curated_sales',
      description: 'Curated sales data',
    });
  });

  it('updates and clears a database description', async () => {
    const update = await request(app.getHttpServer() as Server)
      .patch('/catalogs/iceberg/schemas/nhamay_saigonfood')
      .send({ description: 'Factory warehouse' });
    expect(update.status).toBe(200);
    expect(update.body).toEqual({
      catalog: 'iceberg',
      name: 'nhamay_saigonfood',
      description: 'Factory warehouse',
    });

    const clear = await request(app.getHttpServer() as Server)
      .patch('/catalogs/iceberg/schemas/nhamay_saigonfood')
      .send({ description: null });
    expect(clear.status).toBe(200);
    expect(clear.body).toEqual({ catalog: 'iceberg', name: 'nhamay_saigonfood' });
  });

  it('validates and forwards an optional device UUID for event previews', async () => {
    const deviceId = '78a5815e-076c-48b6-b812-81f6422c5f93';
    const valid = await request(app.getHttpServer() as Server).get(
      `/catalogs/iceberg/schemas/nhamay_saigonfood/tables/mqtt_events/preview?deviceId=${deviceId}`,
    );
    const invalid = await request(app.getHttpServer() as Server).get(
      '/catalogs/iceberg/schemas/nhamay_saigonfood/tables/mqtt_events/preview?deviceId=sensor-1',
    );

    expect(valid.status).toBe(200);
    expect(reader.previewOptions).toEqual({ deviceId });
    expect(invalid.status).toBe(400);
  });
});

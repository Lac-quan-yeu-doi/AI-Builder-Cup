import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { DatabaseServiceDetailsRequestDto } from '@presentation/database-service/database-service.dto';
import { DatabaseServiceResponseDto } from '@presentation/database-service/database-service.response';

async function schemas(): Promise<
  Record<string, { readonly properties?: Record<string, unknown> }>
> {
  const moduleRef = await Test.createTestingModule({}).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();

  try {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
      extraModels: [DatabaseServiceDetailsRequestDto, DatabaseServiceResponseDto],
    });
    return (document.components?.schemas ?? {}) as Record<
      string,
      { readonly properties?: Record<string, unknown> }
    >;
  } finally {
    await app.close();
  }
}

describe('connection DBMS OpenAPI contract', () => {
  it('documents current PostgreSQL and MySQL plugin identifiers while keeping connectorType open', async () => {
    const all = await schemas();
    const requestProperty = all.DatabaseServiceDetailsRequestDto?.properties?.connectorType as
      { readonly type?: string; readonly description?: string } | undefined;
    const responseProperty = all.DatabaseServiceResponseDto?.properties?.connectorType as
      { readonly type?: string; readonly description?: string } | undefined;

    expect(requestProperty).toMatchObject({ type: 'string' });
    expect(responseProperty).toMatchObject({ type: 'string' });
    expect(requestProperty?.description).toContain('POSTGRESQL');
    expect(requestProperty?.description).toContain('MYSQL');
    expect(responseProperty?.description).toContain('POSTGRESQL');
    expect(responseProperty?.description).toContain('MYSQL');
    expect(requestProperty).not.toHaveProperty('enum');
    expect(responseProperty).not.toHaveProperty('enum');
  });
});

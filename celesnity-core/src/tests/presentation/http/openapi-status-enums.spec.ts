import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import {
  ConnectionVerificationResponseDto,
  DatabaseServiceResponseDto,
} from '@presentation/database-service/database-service.response';
import {
  SqlExecutionAcceptedResponseDto,
  SqlExecutionDetailResponseDto,
  SqlExecutionEventResponseDto,
  SqlExecutionSummaryResponseDto,
} from '@presentation/query-workbench/sql-execution.response';

/**
 * Asserts the published OpenAPI status enumerations and the generic connection
 * response shape at the public boundary.
 *
 * Task 3 replaced hand-written `enum: [...]` literals with references to the
 * domain constants. That is only safe if the emitted schema is identical, so the
 * expected member lists here are written out longhand on purpose rather than
 * imported from the constants they are meant to check.
 */
async function schemas(): Promise<
  Record<string, { readonly properties?: Record<string, unknown> }>
> {
  const moduleRef = await Test.createTestingModule({}).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();

  try {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
      extraModels: [
        DatabaseServiceResponseDto,
        ConnectionVerificationResponseDto,
        SqlExecutionAcceptedResponseDto,
        SqlExecutionSummaryResponseDto,
        SqlExecutionDetailResponseDto,
        SqlExecutionEventResponseDto,
      ],
    });
    return (document.components?.schemas ?? {}) as Record<
      string,
      { readonly properties?: Record<string, unknown> }
    >;
  } finally {
    await app.close();
  }
}

function enumOf(
  all: Record<string, { readonly properties?: Record<string, unknown> }>,
  schemaName: string,
  property: string,
): unknown {
  const target = all[schemaName]?.properties?.[property];
  return (target as { readonly enum?: unknown } | undefined)?.enum;
}

describe('published OpenAPI status enumerations', () => {
  it('DatabaseServiceResponseDto.verificationStatus keeps its three members', async () => {
    expect(enumOf(await schemas(), 'DatabaseServiceResponseDto', 'verificationStatus')).toEqual([
      'UNTESTED',
      'SUCCEEDED',
      'FAILED',
    ]);
  });

  it('DatabaseServiceResponseDto exposes DBMS-neutral type and configuration fields', async () => {
    const connectionSchema = (await schemas()).DatabaseServiceResponseDto;

    expect(connectionSchema?.properties?.connectorType).toMatchObject({ type: 'string' });
    expect(connectionSchema?.properties?.configSchemaVersion).toMatchObject({ type: 'number' });
    expect(connectionSchema?.properties?.config).toMatchObject({
      additionalProperties: true,
      type: 'object',
    });
    expect(connectionSchema?.properties).not.toHaveProperty('sslMode');
  });

  it('ConnectionVerificationResponseDto.status keeps its two members', async () => {
    expect(enumOf(await schemas(), 'ConnectionVerificationResponseDto', 'status')).toEqual([
      'SUCCEEDED',
      'FAILED',
    ]);
  });

  it.each([
    'SqlExecutionAcceptedResponseDto',
    'SqlExecutionSummaryResponseDto',
    'SqlExecutionDetailResponseDto',
    'SqlExecutionEventResponseDto',
  ])('%s.status keeps its eight members', async (schemaName) => {
    expect(enumOf(await schemas(), schemaName, 'status')).toEqual([
      'QUEUED',
      'SUBMITTED',
      'RUNNING',
      'CANCELLING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'TIMED_OUT',
    ]);
  });
});

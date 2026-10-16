import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { CoreApiConnectionRepository } from '@/src/infrastructure/repositories/core-api-connection.repository';

type DataConnectionResponseDto = components['schemas']['DatabaseServiceResponseDto'];
type ConnectionVerificationResponseDto = components['schemas']['ConnectionVerificationResponseDto'];

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const responseDto = (
  overrides: Partial<DataConnectionResponseDto> = {},
): DataConnectionResponseDto => ({
  id: 'connection-1',
  name: 'Warehouse',
  databaseNames: [],
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: {
    host: 'db.internal',
    port: 5432,
    databaseName: 'analytics',
    username: 'loader',
    sslMode: 'require',
    options: { applicationName: 'celesnity' },
  },
  summary: [],
  verificationStatus: 'SUCCEEDED',
  lastTestedAt: '2026-08-10T01:05:00.000Z',
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-10T01:05:00.000Z',
  ...overrides,
});

const verificationDto = (
  overrides: Partial<ConnectionVerificationResponseDto> = {},
): ConnectionVerificationResponseDto => ({
  status: 'SUCCEEDED',
  testedAt: '2026-08-10T01:05:00.000Z',
  ...overrides,
});

const bodyOf = (request: RecordedRequest | undefined): unknown =>
  JSON.parse(String(request?.init?.body));

describe('CoreApiConnectionRepository', () => {
  it('lists active connections and maps every response field', async () => {
    const transport = new FakeGeneratedApiTransport({
      items: [responseDto()],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    const repository = new CoreApiConnectionRepository(transport);

    const result = await repository.list();

    expect(transport.requests).toEqual([{ path: '/database-services', init: { method: 'GET' } }]);
    expect(result).toEqual([
      {
        id: 'connection-1',
        name: 'Warehouse',
        type: 'postgresql',
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'require',
        applicationName: 'celesnity',
        verification: {
          status: 'succeeded',
          testedAt: '2026-08-10T01:05:00.000Z',
        },
        createdAt: '2026-08-10T01:00:00.000Z',
        updatedAt: '2026-08-10T01:05:00.000Z',
      },
    ]);
  });

  it('encodes an identifier when getting a connection', async () => {
    const transport = new FakeGeneratedApiTransport(responseDto());
    const repository = new CoreApiConnectionRepository(transport);

    await repository.get('id/with space');

    expect(transport.requests[0]?.path).toBe('/database-services/id%2Fwith%20space');
    expect(transport.requests[0]?.init).toEqual({ method: 'GET' });
  });

  it('tests unsaved structured details with the exact API payload', async () => {
    const transport = new FakeGeneratedApiTransport(verificationDto());
    const repository = new CoreApiConnectionRepository(transport);

    const result = await repository.testUnsaved({
      kind: 'structured',
      host: 'db.internal',
      port: 5432,
      databaseName: 'analytics',
      username: 'loader',
      password: ' secret ',
      sslMode: 'require',
      applicationName: 'celesnity',
    });

    expect(transport.requests[0]?.path).toBe('/database-service-tests');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(bodyOf(transport.requests[0])).toEqual({
      connectorType: 'POSTGRESQL',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        password: ' secret ',
        sslMode: 'require',
        options: { applicationName: 'celesnity' },
      },
    });
    expect(result).toEqual({
      status: 'succeeded',
      testedAt: '2026-08-10T01:05:00.000Z',
    });
  });

  it('tests unsaved URL details without adding structured transport fields', async () => {
    const transport = new FakeGeneratedApiTransport(verificationDto());
    const repository = new CoreApiConnectionRepository(transport);

    await repository.testUnsaved({
      kind: 'url',
      connectionUrl: 'postgresql://loader:secret@db.internal/analytics',
    });

    expect(bodyOf(transport.requests[0])).toEqual({
      connectorType: 'POSTGRESQL',
      details: { connectionUrl: 'postgresql://loader:secret@db.internal/analytics' },
    });
  });

  it('tests a saved connection using an encoded identifier', async () => {
    const transport = new FakeGeneratedApiTransport(verificationDto());
    const repository = new CoreApiConnectionRepository(transport);

    await repository.testSaved('id/with space');

    expect(transport.requests).toEqual([
      { path: '/database-services/id%2Fwith%20space/test', init: { method: 'POST' } },
    ]);
  });

  it('creates a connection with the exact request body', async () => {
    const transport = new FakeGeneratedApiTransport(responseDto());
    const repository = new CoreApiConnectionRepository(transport);

    await repository.create({
      name: 'Warehouse',
      details: {
        kind: 'structured',
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'prefer',
        applicationName: '',
      },
    });

    expect(transport.requests[0]?.path).toBe('/database-services');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(bodyOf(transport.requests[0])).toEqual({
      name: 'Warehouse',
      connectorType: 'POSTGRESQL',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'prefer',
      },
    });
  });

  it('updates a connection and omits absent optional application options', async () => {
    const transport = new FakeGeneratedApiTransport(responseDto());
    const repository = new CoreApiConnectionRepository(transport);

    await repository.update('id/with space', {
      name: 'Warehouse',
      details: {
        kind: 'structured',
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'verify-full',
      },
    });

    expect(transport.requests[0]?.path).toBe('/database-services/id%2Fwith%20space');
    expect(transport.requests[0]?.init?.method).toBe('PATCH');
    expect(bodyOf(transport.requests[0])).toEqual({
      name: 'Warehouse',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'verify-full',
      },
    });
  });

  it('archives a connection using DELETE and an encoded identifier', async () => {
    const transport = new FakeGeneratedApiTransport(undefined);
    const repository = new CoreApiConnectionRepository(transport);

    await repository.archive('id/with space');

    expect(transport.requests).toEqual([
      { path: '/database-services/id%2Fwith%20space', init: { method: 'DELETE' } },
    ]);
  });

  it('omits empty optional application names and maps every verification status', async () => {
    const transport = new FakeGeneratedApiTransport(
      responseDto({
        config: {
          host: 'db.internal',
          port: 5432,
          databaseName: 'analytics',
          username: 'loader',
          sslMode: 'require',
          options: {},
        },
        verificationStatus: 'UNTESTED',
        lastTestedAt: undefined,
      }),
      responseDto({
        config: {
          host: 'db.internal',
          port: 5432,
          databaseName: 'analytics',
          username: 'loader',
          sslMode: 'require',
          options: { applicationName: '' },
        },
        verificationStatus: 'FAILED',
        lastTestedAt: '2026-08-10T01:05:00.000Z',
      }),
    );
    const repository = new CoreApiConnectionRepository(transport);

    const untested = await repository.get('untested');
    const failed = await repository.get('failed');

    expect(untested).not.toHaveProperty('applicationName');
    expect(untested.verification).toEqual({ status: 'untested' });
    expect(failed).not.toHaveProperty('applicationName');
    expect(failed.verification).toEqual({
      status: 'failed',
      testedAt: '2026-08-10T01:05:00.000Z',
    });
  });

  it('sanitizes verification messages from persisted and ad-hoc tests', async () => {
    const transport = new FakeGeneratedApiTransport(
      responseDto({
        verificationStatus: 'FAILED',
        lastTestError: 'password=hunter2 at postgresql://loader:secret@db.internal/analytics',
      }),
      verificationDto({
        status: 'FAILED',
        failureReason: 'postgres://loader:secret@db.internal/analytics',
      }),
    );
    const repository = new CoreApiConnectionRepository(transport);

    const persisted = await repository.get('connection-1');
    const tested = await repository.testSaved('connection-1');

    expect(persisted.verification.message).toBe(
      'password=[redacted] at PostgreSQL endpoint [redacted]',
    );
    expect(tested).toEqual({
      status: 'failed',
      testedAt: '2026-08-10T01:05:00.000Z',
      message: 'PostgreSQL endpoint [redacted]',
    });
  });

  it('rejects a response for a DBMS that the current UI does not render', async () => {
    const transport = new FakeGeneratedApiTransport({
      items: [responseDto({ connectorType: 'MYSQL' })],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    const repository = new CoreApiConnectionRepository(transport);

    await expect(repository.list()).rejects.toThrow(
      'Only PostgreSQL connections are supported by the current UI: MYSQL',
    );
  });

  it.each([
    [new CoreApiError(404, 'Connection not found.'), NotFoundError],
    [new CoreApiError(409, 'Connection already archived.'), ConflictError],
    [new CoreApiError(503, 'Core API unavailable.'), RemoteServiceError],
    [new TypeError('fetch failed'), RemoteServiceError],
  ])('translates external failures at the repository boundary', async (cause, ErrorType) => {
    const repository = new CoreApiConnectionRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.list()).rejects.toMatchObject({
      constructor: ErrorType,
      cause,
    });
  });
});

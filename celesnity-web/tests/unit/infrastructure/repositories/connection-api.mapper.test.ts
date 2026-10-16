import { describe, expect, it } from 'vitest';

import type {
  ConnectionDetailsInput,
  DataConnectionInput,
  StructuredConnectionInput,
} from '@/src/entities/models/connection';
import type { components } from '@/src/infrastructure/api/generated/schema';
import {
  fromConnectionResponse,
  fromVerificationResponse,
  toCreateConnectionRequest,
  toTestConnectionRequest,
  toUpdateConnectionRequest,
} from '@/src/infrastructure/repositories/connection-api.mapper';

type DataConnectionResponseDto = components['schemas']['DatabaseServiceResponseDto'];
type ConnectionVerificationResponseDto = components['schemas']['ConnectionVerificationResponseDto'];

const structuredDetails: StructuredConnectionInput = {
  kind: 'structured',
  host: 'db.internal',
  port: 5432,
  databaseName: 'analytics',
  username: 'reporting',
  password: 'test-secret',
  sslMode: 'require',
  applicationName: 'celesnity-web',
};

const input: DataConnectionInput = {
  name: 'Analytics',
  details: structuredDetails,
};

const genericPostgresResponse = (
  overrides: Partial<DataConnectionResponseDto> = {},
): DataConnectionResponseDto => ({
  id: 'connection-id',
  name: 'Analytics',
  databaseNames: [],
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: {
    host: 'db.internal',
    port: 5432,
    databaseName: 'analytics',
    username: 'reporting',
    sslMode: 'require',
    options: { applicationName: 'celesnity-web' },
  },
  summary: [],
  verificationStatus: 'SUCCEEDED',
  lastTestedAt: '2026-08-09T00:00:00.000Z',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
});

describe('Connection API request mapping', () => {
  it('wraps structured PostgreSQL details in the generic create request', () => {
    expect(toCreateConnectionRequest(input)).toEqual({
      name: 'Analytics',
      connectorType: 'POSTGRESQL',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'reporting',
        password: 'test-secret',
        sslMode: 'require',
        options: { applicationName: 'celesnity-web' },
      },
    });
  });

  it('wraps structured PostgreSQL details in the generic unsaved-test request', () => {
    expect(toTestConnectionRequest(structuredDetails)).toEqual({
      connectorType: 'POSTGRESQL',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'reporting',
        password: 'test-secret',
        sslMode: 'require',
        options: { applicationName: 'celesnity-web' },
      },
    });
  });

  it('does not send a DBMS type when updating an existing connection', () => {
    expect(toUpdateConnectionRequest(input)).toEqual({
      name: 'Analytics',
      details: {
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'reporting',
        password: 'test-secret',
        sslMode: 'require',
        options: { applicationName: 'celesnity-web' },
      },
    });
  });

  it('wraps URL details without adding structured transport fields', () => {
    const details: ConnectionDetailsInput = {
      kind: 'url',
      connectionUrl: 'postgresql://reporting:test-secret@db.internal/analytics',
    };

    expect(toTestConnectionRequest(details)).toEqual({
      connectorType: 'POSTGRESQL',
      details: { connectionUrl: details.connectionUrl },
    });
  });
});

describe('Connection API response mapping', () => {
  it('maps a generic PostgreSQL response into the existing UI model', () => {
    expect(fromConnectionResponse(genericPostgresResponse())).toEqual({
      id: 'connection-id',
      name: 'Analytics',
      type: 'postgresql',
      host: 'db.internal',
      port: 5432,
      databaseName: 'analytics',
      username: 'reporting',
      sslMode: 'require',
      applicationName: 'celesnity-web',
      verification: {
        status: 'succeeded',
        testedAt: '2026-08-09T00:00:00.000Z',
      },
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    });
  });

  it('rejects a response for a DBMS that the current UI does not render', () => {
    expect(() =>
      fromConnectionResponse({ ...genericPostgresResponse(), connectorType: 'MYSQL' }),
    ).toThrow('Only PostgreSQL connections are supported by the current UI: MYSQL');
  });

  it('rejects an invalid PostgreSQL configuration', () => {
    expect(() =>
      fromConnectionResponse({ ...genericPostgresResponse(), config: { host: 'db.internal' } }),
    ).toThrow('The Core API returned an invalid PostgreSQL connection configuration.');
  });

  it('sanitizes persisted verification messages before returning the UI model', () => {
    const result = fromConnectionResponse(
      genericPostgresResponse({
        verificationStatus: 'FAILED',
        lastTestError: 'password=test-secret at postgresql://reporting:test-secret@db.internal',
      }),
    );

    expect(result.verification.message).toBe(
      'password=[redacted] at PostgreSQL endpoint [redacted]',
    );
  });
});

describe('Connection verification response mapping', () => {
  it('maps and sanitizes a failed verification response', () => {
    const response: ConnectionVerificationResponseDto = {
      status: 'FAILED',
      testedAt: '2026-08-09T00:00:00.000Z',
      failureReason: 'postgresql://reporting:test-secret@db.internal',
    };

    expect(fromVerificationResponse(response)).toEqual({
      status: 'failed',
      testedAt: '2026-08-09T00:00:00.000Z',
      message: 'PostgreSQL endpoint [redacted]',
    });
  });
});

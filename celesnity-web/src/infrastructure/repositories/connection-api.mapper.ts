import type { components } from '@/src/infrastructure/api/generated/schema';
import {
  SSL_MODES,
  sanitizeVerificationMessage,
  type ConnectionDetailsInput,
  type ConnectionVerificationResult,
  type DataConnection,
  type DataConnectionInput,
  type SslMode,
} from '@/src/entities/models/connection';

type ConnectionDetailsRequestDto = components['schemas']['DatabaseServiceDetailsRequestDto'];
type CreateConnectionRequestDto = components['schemas']['CreateDatabaseServiceRequestDto'];
type UpdateConnectionRequestDto = components['schemas']['UpdateDatabaseServiceRequestDto'];
type DataConnectionResponseDto = components['schemas']['DatabaseServiceResponseDto'];
type ConnectionVerificationResponseDto = components['schemas']['ConnectionVerificationResponseDto'];

const POSTGRESQL_DBMS_TYPE = 'POSTGRESQL';

export function toCreateConnectionRequest(input: DataConnectionInput): CreateConnectionRequestDto {
  return {
    name: input.name,
    ...toConnectionDetailsRequest(input.details),
  };
}

export function toTestConnectionRequest(
  details: ConnectionDetailsInput,
): ConnectionDetailsRequestDto {
  return toConnectionDetailsRequest(details);
}

export function toUpdateConnectionRequest(input: DataConnectionInput): UpdateConnectionRequestDto {
  return {
    name: input.name,
    details: toDetails(input.details),
  };
}

export function fromConnectionResponse(dto: DataConnectionResponseDto): DataConnection {
  if (dto.connectorType !== POSTGRESQL_DBMS_TYPE) {
    throw new Error(
      `Only PostgreSQL connections are supported by the current UI: ${dto.connectorType}`,
    );
  }

  const config = postgresConfig(dto.config);
  const message = sanitizeVerificationMessage(dto.lastTestError);
  const applicationName = config.options?.applicationName;

  return {
    id: dto.id,
    name: dto.name,
    type: 'postgresql',
    host: config.host,
    port: config.port,
    databaseName: config.databaseName,
    username: config.username,
    sslMode: config.sslMode,
    ...(applicationName ? { applicationName } : {}),
    verification: {
      status:
        dto.verificationStatus === 'SUCCEEDED'
          ? 'succeeded'
          : dto.verificationStatus === 'FAILED'
            ? 'failed'
            : 'untested',
      ...(dto.lastTestedAt ? { testedAt: dto.lastTestedAt } : {}),
      ...(message ? { message } : {}),
    },
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function fromVerificationResponse(
  dto: ConnectionVerificationResponseDto,
): ConnectionVerificationResult {
  const message = sanitizeVerificationMessage(dto.failureReason);

  return {
    status: dto.status === 'SUCCEEDED' ? 'succeeded' : 'failed',
    testedAt: dto.testedAt,
    ...(message ? { message } : {}),
  };
}

function toConnectionDetailsRequest(details: ConnectionDetailsInput): ConnectionDetailsRequestDto {
  return {
    connectorType: POSTGRESQL_DBMS_TYPE,
    details: toDetails(details),
  };
}

function toDetails(details: ConnectionDetailsInput): Record<string, unknown> {
  if (details.kind === 'url') {
    return { connectionUrl: details.connectionUrl };
  }

  return {
    host: details.host,
    port: details.port,
    databaseName: details.databaseName,
    username: details.username,
    sslMode: details.sslMode,
    ...(details.password ? { password: details.password } : {}),
    ...(details.applicationName ? { options: { applicationName: details.applicationName } } : {}),
  };
}

interface PostgresConfig {
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly username: string;
  readonly sslMode: SslMode;
  readonly options?: {
    readonly applicationName?: string;
  };
}

function postgresConfig(value: Record<string, unknown>): PostgresConfig {
  if (
    typeof value.host !== 'string' ||
    typeof value.port !== 'number' ||
    typeof value.databaseName !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.sslMode !== 'string' ||
    !SSL_MODES.includes(value.sslMode as SslMode)
  ) {
    throw new Error('The Core API returned an invalid PostgreSQL connection configuration.');
  }

  const options = value.options;
  if (options !== undefined && !isRecord(options)) {
    throw new Error('The Core API returned an invalid PostgreSQL connection options object.');
  }

  return {
    host: value.host,
    port: value.port,
    databaseName: value.databaseName,
    username: value.username,
    sslMode: value.sslMode as SslMode,
    ...(isRecord(options)
      ? {
          options: {
            ...(typeof options.applicationName === 'string'
              ? { applicationName: options.applicationName }
              : {}),
          },
        }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

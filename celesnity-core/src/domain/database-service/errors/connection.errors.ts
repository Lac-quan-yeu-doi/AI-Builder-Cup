import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

/**
 * Domain errors for the Connection Registry context.
 *
 * A single error type carries a discriminating {@link ConnectionErrorCode}
 * rather than a separate class per variant. The HTTP adapter maps each code to
 * a status; messages are safe to surface.
 */

/**
 * Classifies a database-service failure.
 * - `VALIDATION` -> 400: input failed validation.
 * - `NOT_FOUND` -> 404: no connection matched.
 * - `NAME_CONFLICT` -> 409: a connection with the same name already exists.
 * - `ARCHIVED` -> 409: an archived connection cannot be changed or tested.
 * - `CHANGED_DURING_TEST` -> 409: the connection changed while being tested.
 * - `UNSUPPORTED_DBMS` -> 422: no installed plugin can handle the selected DBMS.
 * - `DATABASE_NOT_FOUND` -> 404: no visible catalog database matched.
 * - `DATABASE_SERVICE_NOT_FOUND` -> 404: no active datasource matched.
 * - `DATASOURCE_USED_BY_PIPELINES` -> 409: a membership is still referenced.
 * - `DATASOURCE_STILL_LINKED` -> 409: an archive was attempted while linked.
 */
export enum ConnectionErrorCode {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  NAME_CONFLICT = 'NAME_CONFLICT',
  ARCHIVED = 'ARCHIVED',
  CHANGED_DURING_TEST = 'CHANGED_DURING_TEST',
  UNSUPPORTED_DBMS = 'UNSUPPORTED_DBMS',
  CDC_PROFILE_IN_USE = 'CDC_PROFILE_IN_USE',
  CDC_PROFILE_CHANGED = 'CDC_PROFILE_CHANGED',
  DATABASE_NOT_FOUND = 'DATABASE_NOT_FOUND',
  DATABASE_SERVICE_NOT_FOUND = 'DATABASE_SERVICE_NOT_FOUND',
  DATASOURCE_USED_BY_PIPELINES = 'DATASOURCE_USED_BY_PIPELINES',
  DATASOURCE_STILL_LINKED = 'DATASOURCE_STILL_LINKED',
}

export interface ConnectionPipelineUsageDetail {
  readonly id: string;
  readonly name: string;
}

/** The single error raised by the Connection Registry context. */
export class ConnectionError extends Error {
  public readonly code: ConnectionErrorCode;
  public readonly details?: readonly ConnectionPipelineUsageDetail[];

  public constructor(
    code: ConnectionErrorCode,
    message: string,
    details?: readonly ConnectionPipelineUsageDetail[],
  ) {
    super(message);
    this.name = 'ConnectionError';
    this.code = code;
    this.details = details;
  }

  /** Input (name, endpoint, credentials, URL, id) failed validation. */
  public static validation(message: string): ConnectionError {
    return new ConnectionError(ConnectionErrorCode.VALIDATION, message);
  }

  public static notFound(): ConnectionError {
    return new ConnectionError(ConnectionErrorCode.NOT_FOUND, 'The connection was not found.');
  }

  public static nameConflict(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.NAME_CONFLICT,
      'A connection with this name already exists.',
    );
  }

  public static archived(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.ARCHIVED,
      'Archived connections cannot be changed or tested.',
    );
  }

  public static changedDuringTest(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.CHANGED_DURING_TEST,
      'The connection changed while it was being tested. Retry with the latest details.',
    );
  }

  public static unsupportedDbms(connectorType: string): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.UNSUPPORTED_DBMS,
      ConnectionMessage.connectorTypeUnsupported(connectorType),
    );
  }

  public static cdcProfileInUse(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.CDC_PROFILE_IN_USE,
      'The CDC connection cannot be removed while active CDC workflows use this datasource.',
    );
  }

  public static cdcProfileChanged(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.CDC_PROFILE_CHANGED,
      'The CDC connection changed during this operation. Retry with the latest profile.',
    );
  }

  public static databaseNotFound(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.DATABASE_NOT_FOUND,
      'The catalog database was not found.',
    );
  }

  public static databaseServiceNotFound(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.DATABASE_SERVICE_NOT_FOUND,
      'The datasource was not found.',
    );
  }

  public static datasourceUsedByPipelines(
    pipelines: readonly ConnectionPipelineUsageDetail[],
  ): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.DATASOURCE_USED_BY_PIPELINES,
      'The datasource is still used by pipelines in this database.',
      pipelines,
    );
  }

  public static datasourceStillLinked(): ConnectionError {
    return new ConnectionError(
      ConnectionErrorCode.DATASOURCE_STILL_LINKED,
      'The datasource cannot be archived while it is linked to a catalog database.',
    );
  }
}

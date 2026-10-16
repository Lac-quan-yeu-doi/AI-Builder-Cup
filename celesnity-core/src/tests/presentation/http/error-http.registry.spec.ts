import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';
import { HttpException, HttpStatus } from '@nestjs/common';

import {
  ConnectionAccessError,
  ConnectionAccessErrorCode,
} from '@application/database-service/errors/connection-access.error';
import {
  ExecutionPortError,
  ExecutionPortErrorCode,
} from '@application/execution-orchestration/errors/execution-port.error';
import { QueryPortError } from '@application/query-workbench/errors/query-port.error';
import {
  ArtifactError,
  ArtifactErrorCode,
} from '@application/script-authoring/errors/artifact.error';
import {
  ScriptPublicationError,
  ScriptPublicationErrorCode,
} from '@application/script-authoring/errors/script-publication.error';
import { CatalogError, CatalogErrorCode } from '@domain/catalog-exploration/errors/catalog.errors';
import {
  ConnectionError,
  ConnectionErrorCode,
} from '@domain/database-service/errors/connection.errors';
import {
  ExecutionError,
  ExecutionErrorCode,
} from '@domain/execution-orchestration/errors/execution.errors';
import {
  SqlExecutionError,
  SqlExecutionErrorCode,
} from '@domain/query-workbench/errors/sql-execution.errors';
import { ScriptError, ScriptErrorCode } from '@domain/script-authoring/errors/script.errors';
import { PendingActionError } from '@application/actions/pending-action.errors';
import { CsvIngestionError } from '@application/chart/csv-ingestion';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import { toHttpException } from '@presentation/http/error-http.registry';

/**
 * Table-driven coverage of the registry in isolation.
 *
 * The end-to-end specification in error-http-mapping.spec.ts asserts what a
 * client receives; this one asserts every declared error code has a decided
 * status, so a code added to an enum cannot slip through with no mapping.
 */

function statusOf(error: unknown): number | undefined {
  return toHttpException(error)?.getStatus();
}

function detailOf(error: unknown): string | undefined {
  const exception = toHttpException(error);
  if (exception === undefined) {
    return undefined;
  }
  const body = exception.getResponse();
  return typeof body === 'object' && body !== null
    ? ((body as { readonly message?: string }).message ?? undefined)
    : undefined;
}

describe('toHttpException', () => {
  it('maps invalid replay to the existing 409 problem-details code without exposing cursor ownership', () => {
    const exception = toHttpException(MessageBlockError.invalidCursor());
    expect(exception?.getStatus()).toBe(409);
    expect(exception?.getResponse()).toEqual(
      expect.objectContaining({ code: 'MESSAGE_BLOCK_CURSOR_INVALID' }),
    );
  });
  describe('domain errors', () => {
    it.each([
      [ConnectionError.validation('bad'), HttpStatus.BAD_REQUEST],
      [ConnectionError.notFound(), HttpStatus.NOT_FOUND],
      [ConnectionError.nameConflict(), HttpStatus.CONFLICT],
      [ConnectionError.archived(), HttpStatus.CONFLICT],
      [ConnectionError.changedDuringTest(), HttpStatus.CONFLICT],
    ])('maps ConnectionError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [CatalogError.validation('bad'), HttpStatus.BAD_REQUEST],
      [CatalogError.unavailable(), HttpStatus.SERVICE_UNAVAILABLE],
      [CatalogError.query(), HttpStatus.BAD_GATEWAY],
    ])('maps CatalogError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [ScriptError.validation('bad'), HttpStatus.BAD_REQUEST],
      [ScriptError.notFound(), HttpStatus.NOT_FOUND],
      [ScriptError.versionNotFound(), HttpStatus.NOT_FOUND],
      [ScriptError.archived(), HttpStatus.CONFLICT],
      [ScriptError.draft(), HttpStatus.CONFLICT],
      [ScriptError.metadataConflict(), HttpStatus.CONFLICT],
      [ScriptError.publicationConflict(), HttpStatus.CONFLICT],
    ])('maps ScriptError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [ExecutionError.validation('bad'), HttpStatus.BAD_REQUEST],
      [ExecutionError.notFound(), HttpStatus.NOT_FOUND],
      [ExecutionError.transition('A', 'B'), HttpStatus.CONFLICT],
      [ExecutionError.notCancellable(), HttpStatus.CONFLICT],
      [ExecutionError.concurrency(), HttpStatus.CONFLICT],
    ])('maps ExecutionError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [SqlExecutionError.validation('bad'), HttpStatus.BAD_REQUEST],
      [SqlExecutionError.readOnlyViolation('no writes'), HttpStatus.UNPROCESSABLE_ENTITY],
      [SqlExecutionError.notFound(), HttpStatus.NOT_FOUND],
      [SqlExecutionError.illegalTransition('A', 'B'), HttpStatus.CONFLICT],
      [SqlExecutionError.stateConflict(), HttpStatus.CONFLICT],
    ])('maps SqlExecutionError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [DashboardError.validation('bad'), HttpStatus.BAD_REQUEST],
      [DashboardError.notFound(), HttpStatus.NOT_FOUND],
      [DashboardError.accessDenied(), HttpStatus.FORBIDDEN],
      [DashboardError.revisionConflict(), HttpStatus.CONFLICT],
    ])('maps DashboardError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });
  });

  describe('port errors', () => {
    it.each([
      [ConnectionAccessError.invalidId(), HttpStatus.BAD_REQUEST],
      [ConnectionAccessError.notFound(), HttpStatus.NOT_FOUND],
      [ConnectionAccessError.destinationRejected('nope'), HttpStatus.BAD_REQUEST],
    ])('maps ConnectionAccessError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it.each([
      [ArtifactError.alreadyExists(), HttpStatus.CONFLICT],
      [ArtifactError.missing(), HttpStatus.INTERNAL_SERVER_ERROR],
      [ArtifactError.integrity(), HttpStatus.INTERNAL_SERVER_ERROR],
      [ArtifactError.storageUnavailable(), HttpStatus.SERVICE_UNAVAILABLE],
      [ArtifactError.cleanupFailed(), HttpStatus.SERVICE_UNAVAILABLE],
      [ArtifactError.versioningRequired(), HttpStatus.SERVICE_UNAVAILABLE],
    ])('maps ArtifactError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });

    it('maps ScriptPublicationError to 503', () => {
      expect(statusOf(ScriptPublicationError.lockUnavailable())).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });

    it.each([
      [ExecutionPortError.logStoreUnavailable(), HttpStatus.SERVICE_UNAVAILABLE],
      [ExecutionPortError.sparkUnavailable(), HttpStatus.SERVICE_UNAVAILABLE],
    ])('maps ExecutionPortError %#', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });
  });

  describe('exhaustiveness', () => {
    // A code with no entry would return undefined here and surface as a silent
    // 500, so each enum is walked in full.
    it.each(Object.values(ConnectionErrorCode))('ConnectionErrorCode.%s is mapped', (code) => {
      expect(statusOf(new ConnectionError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(ConnectionAccessErrorCode))(
      'ConnectionAccessErrorCode.%s is mapped',
      (code) => {
        expect(statusOf(new ConnectionAccessError(code, 'x'))).toBeDefined();
      },
    );

    it.each(Object.values(CatalogErrorCode))('CatalogErrorCode.%s is mapped', (code) => {
      expect(statusOf(new CatalogError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(ScriptErrorCode))('ScriptErrorCode.%s is mapped', (code) => {
      expect(statusOf(new ScriptError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(ExecutionErrorCode))('ExecutionErrorCode.%s is mapped', (code) => {
      expect(statusOf(new ExecutionError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(SqlExecutionErrorCode))('SqlExecutionErrorCode.%s is mapped', (code) => {
      expect(statusOf(new SqlExecutionError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(ArtifactErrorCode))('ArtifactErrorCode.%s is mapped', (code) => {
      expect(statusOf(new ArtifactError(code, 'x'))).toBeDefined();
    });

    it.each(Object.values(ScriptPublicationErrorCode))(
      'ScriptPublicationErrorCode.%s is mapped',
      (code) => {
        expect(statusOf(new ScriptPublicationError(code, 'x'))).toBeDefined();
      },
    );

    it.each(Object.values(ExecutionPortErrorCode))(
      'ExecutionPortErrorCode.%s is mapped',
      (code) => {
        expect(statusOf(new ExecutionPortError(code, 'x'))).toBeDefined();
      },
    );
  });

  describe('errors with no mapping', () => {
    it('leaves a plain Error untranslated', () => {
      expect(toHttpException(new Error('boom'))).toBeUndefined();
    });

    it.each([[undefined], [null], ['a string'], [42], [{ code: 'NOT_FOUND' }]])(
      'leaves the non-error value %p untranslated',
      (value) => {
        expect(toHttpException(value)).toBeUndefined();
      },
    );

    it('leaves QueryPortError untranslated, because it never reaches a request', () => {
      // The query gateway is only used by the background runner. Recorded as a
      // decision so a future reader does not "fix" it by adding a status.
      expect(toHttpException(QueryPortError.gatewayUnavailable())).toBeUndefined();
    });
  });

  describe('response detail', () => {
    it("surfaces the error's own message by default", () => {
      expect(detailOf(ConnectionError.validation('Host is required.'))).toBe('Host is required.');
      expect(detailOf(ConnectionAccessError.destinationRejected('nope'))).toBe('nope');
    });

    it('substitutes a fixed message where the replaced mappers did', () => {
      expect(detailOf(ArtifactError.storageUnavailable())).toBe(
        'The script artifact store is temporarily unavailable.',
      );
      expect(detailOf(ExecutionPortError.logStoreUnavailable())).toBe(
        'Execution orchestration is temporarily unavailable.',
      );
      expect(detailOf(ScriptPublicationError.lockUnavailable())).toBe(
        'Script publication is temporarily unavailable.',
      );
    });

    it('discards a custom Spark cause rather than surfacing it', () => {
      expect(
        detailOf(ExecutionPortError.sparkUnavailable('docker socket at /var/run missing')),
      ).toBe('Execution orchestration is temporarily unavailable.');
    });

    it('returns an HttpException instance', () => {
      expect(toHttpException(ConnectionError.notFound())).toBeInstanceOf(HttpException);
    });
  });

  describe('pending-action expiry', () => {
    it('maps an expired pending action to 409', () => {
      expect(statusOf(PendingActionError.expired('id-1', '2026-08-23T00:00:00.000Z'))).toBe(
        HttpStatus.CONFLICT,
      );
    });
  });

  describe('CSV ingestion', () => {
    it.each([
      [CsvIngestionError.tooLarge(999), HttpStatus.BAD_REQUEST],
      [CsvIngestionError.tooManyRows(999), HttpStatus.BAD_REQUEST],
      [CsvIngestionError.empty(), HttpStatus.BAD_REQUEST],
      [CsvIngestionError.malformed('bad quote'), HttpStatus.BAD_REQUEST],
    ])('maps %#: %s to %i', (error, status) => {
      expect(statusOf(error)).toBe(status);
    });
  });
});

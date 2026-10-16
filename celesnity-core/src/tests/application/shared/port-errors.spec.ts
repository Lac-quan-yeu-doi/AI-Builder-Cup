import {
  ConnectionAccessError,
  ConnectionAccessErrorCode,
} from '@application/database-service/errors/connection-access.error';
import {
  ArtifactError,
  ArtifactErrorCode,
} from '@application/script-authoring/errors/artifact.error';
import {
  ScriptPublicationError,
  ScriptPublicationErrorCode,
} from '@application/script-authoring/errors/script-publication.error';
import {
  ExecutionPortError,
  ExecutionPortErrorCode,
} from '@application/execution-orchestration/errors/execution-port.error';
import {
  QueryPortError,
  QueryPortErrorCode,
} from '@application/query-workbench/errors/query-port.error';

/**
 * Verifies the five consolidated port errors that replaced fifteen
 * one-per-variant classes.
 *
 * The message assertions are the important part: several of these strings reach
 * a client through the HTTP layer, so they are reproduced here exactly as the
 * classes they replaced produced them. The end-to-end specification in
 * presentation/http covers the status codes those messages are paired with.
 */

describe('ConnectionAccessError', () => {
  it.each([
    [
      ConnectionAccessError.invalidId(),
      ConnectionAccessErrorCode.INVALID_ID,
      'Connection ID must be a valid UUID.',
    ],
    [
      ConnectionAccessError.notFound(),
      ConnectionAccessErrorCode.NOT_FOUND,
      'The selected active connection was not found.',
    ],
  ])('carries code %#', (error, code, message) => {
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe('ConnectionAccessError');
    expect(error).toBeInstanceOf(Error);
  });

  it('carries the caller-supplied reason for a rejected destination', () => {
    const error = ConnectionAccessError.destinationRejected('Private addresses are not allowed.');

    expect(error.code).toBe(ConnectionAccessErrorCode.DESTINATION_REJECTED);
    expect(error.message).toBe('Private addresses are not allowed.');
  });

  it('collapses what were two identical "invalid id" classes into one factory', () => {
    // The execution-profile and reference providers each had their own class
    // carrying this exact message; both now resolve to the same value.
    expect(ConnectionAccessError.invalidId().message).toBe(
      ConnectionAccessError.invalidId().message,
    );
    expect(ConnectionAccessError.invalidId().code).toBe(ConnectionAccessErrorCode.INVALID_ID);
  });

  describe('is', () => {
    it('matches any code when none is given', () => {
      expect(ConnectionAccessError.is(ConnectionAccessError.notFound())).toBe(true);
    });

    it('matches a listed code', () => {
      expect(
        ConnectionAccessError.is(
          ConnectionAccessError.notFound(),
          ConnectionAccessErrorCode.NOT_FOUND,
          ConnectionAccessErrorCode.INVALID_ID,
        ),
      ).toBe(true);
    });

    it('rejects an unlisted code', () => {
      expect(
        ConnectionAccessError.is(
          ConnectionAccessError.notFound(),
          ConnectionAccessErrorCode.INVALID_ID,
        ),
      ).toBe(false);
    });

    it('rejects an unrelated value', () => {
      expect(ConnectionAccessError.is(new Error('boom'))).toBe(false);
      expect(ConnectionAccessError.is(undefined)).toBe(false);
    });
  });
});

describe('ArtifactError', () => {
  it.each([
    [
      ArtifactError.alreadyExists(),
      ArtifactErrorCode.ALREADY_EXISTS,
      'The deterministic script artifact already exists with different content.',
    ],
    [
      ArtifactError.missing(),
      ArtifactErrorCode.MISSING,
      'The published script artifact is missing.',
    ],
    [
      ArtifactError.integrity(),
      ArtifactErrorCode.INTEGRITY,
      'The published script artifact failed its integrity check.',
    ],
    [
      ArtifactError.storageUnavailable(),
      ArtifactErrorCode.STORAGE_UNAVAILABLE,
      'The script artifact store is temporarily unavailable.',
    ],
    [
      ArtifactError.cleanupFailed(),
      ArtifactErrorCode.CLEANUP_FAILED,
      'The failed publication artifact could not be removed safely.',
    ],
    [
      ArtifactError.versioningRequired(),
      ArtifactErrorCode.VERSIONING_REQUIRED,
      'Versioning must be enabled for the script artifacts bucket.',
    ],
  ])('carries code %#', (error, code, message) => {
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe('ArtifactError');
  });

  it('covers every declared code with a factory', () => {
    const produced = [
      ArtifactError.alreadyExists(),
      ArtifactError.missing(),
      ArtifactError.integrity(),
      ArtifactError.storageUnavailable(),
      ArtifactError.cleanupFailed(),
      ArtifactError.versioningRequired(),
    ].map((error) => error.code);

    expect([...produced].sort()).toEqual(Object.values(ArtifactErrorCode).sort());
  });

  it('narrows on several codes at once', () => {
    expect(
      ArtifactError.is(
        ArtifactError.integrity(),
        ArtifactErrorCode.INTEGRITY,
        ArtifactErrorCode.MISSING,
      ),
    ).toBe(true);
    expect(
      ArtifactError.is(
        ArtifactError.cleanupFailed(),
        ArtifactErrorCode.INTEGRITY,
        ArtifactErrorCode.MISSING,
      ),
    ).toBe(false);
  });
});

describe('ScriptPublicationError', () => {
  it('carries the lock-unavailable code and message', () => {
    const error = ScriptPublicationError.lockUnavailable();

    expect(error.code).toBe(ScriptPublicationErrorCode.LOCK_UNAVAILABLE);
    expect(error.message).toBe('The script publication lock is temporarily unavailable.');
    expect(error.name).toBe('ScriptPublicationError');
  });

  it('does not match an artifact error', () => {
    expect(ScriptPublicationError.is(ArtifactError.storageUnavailable())).toBe(false);
  });
});

describe('ExecutionPortError', () => {
  it('carries the log-store code and message', () => {
    const error = ExecutionPortError.logStoreUnavailable();

    expect(error.code).toBe(ExecutionPortErrorCode.LOG_STORE_UNAVAILABLE);
    expect(error.message).toBe('The execution log store is temporarily unavailable.');
    expect(error.name).toBe('ExecutionPortError');
  });

  it('defaults the Spark message', () => {
    expect(ExecutionPortError.sparkUnavailable().message).toBe(
      'The Spark execution environment is temporarily unavailable.',
    );
  });

  it('keeps the optional Spark message override the replaced class offered', () => {
    const error = ExecutionPortError.sparkUnavailable('docker socket missing');

    expect(error.code).toBe(ExecutionPortErrorCode.SPARK_UNAVAILABLE);
    expect(error.message).toBe('docker socket missing');
  });

  it('distinguishes its two codes', () => {
    expect(
      ExecutionPortError.is(
        ExecutionPortError.sparkUnavailable(),
        ExecutionPortErrorCode.LOG_STORE_UNAVAILABLE,
      ),
    ).toBe(false);
  });
});

describe('QueryPortError', () => {
  it('defaults the gateway message', () => {
    const error = QueryPortError.gatewayUnavailable();

    expect(error.code).toBe(QueryPortErrorCode.GATEWAY_UNAVAILABLE);
    expect(error.message).toBe('The SQL query engine is unavailable.');
    expect(error.name).toBe('QueryPortError');
  });

  it('keeps the optional message override the replaced class offered', () => {
    expect(
      QueryPortError.gatewayUnavailable('Trino did not return a query identifier.').message,
    ).toBe('Trino did not return a query identifier.');
  });
});

describe('the five port error types stay mutually exclusive', () => {
  const samples = [
    ConnectionAccessError.notFound(),
    ArtifactError.missing(),
    ScriptPublicationError.lockUnavailable(),
    ExecutionPortError.logStoreUnavailable(),
    QueryPortError.gatewayUnavailable(),
  ];
  // Wrapped rather than referenced directly so the statics stay bound to their class.
  const guards: readonly ((error: unknown) => boolean)[] = [
    (error): boolean => ConnectionAccessError.is(error),
    (error): boolean => ArtifactError.is(error),
    (error): boolean => ScriptPublicationError.is(error),
    (error): boolean => ExecutionPortError.is(error),
    (error): boolean => QueryPortError.is(error),
  ];

  it('each guard accepts exactly one of the five samples', () => {
    for (const [index, guard] of guards.entries()) {
      expect(samples.filter((sample) => guard(sample))).toEqual([samples[index]]);
    }
  });

  it('each carries a distinct name', () => {
    expect(new Set(samples.map((sample) => sample.name)).size).toBe(samples.length);
  });
});

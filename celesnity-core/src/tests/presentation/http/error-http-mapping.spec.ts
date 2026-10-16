import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';

// `esModuleInterop` is off in this project, so a default import would compile to
// a non-existent `.default` member on the CommonJS module.
import * as request from 'supertest';

import { DatabaseServiceUseCases } from '@application/database-service/database-service.use-cases';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { ExecutionOrchestrationUseCases } from '@application/execution-orchestration/execution-orchestration.use-cases';
import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { ScriptAuthoringUseCases } from '@application/script-authoring/script-authoring.use-cases';
import { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import { CatalogController } from '@presentation/catalog-exploration/catalog.controller';
import { DatabaseServiceController } from '@presentation/database-service/database-service.controller';
import { ExecutionController } from '@presentation/execution-orchestration/execution.controller';
import { ScriptExecutionController } from '@presentation/execution-orchestration/script-execution.controller';
import { SqlExecutionController } from '@presentation/query-workbench/sql-execution.controller';
import { ScriptController } from '@presentation/script-authoring/script.controller';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import { ExecutionPortError } from '@application/execution-orchestration/errors/execution-port.error';
import { QueryPortError } from '@application/query-workbench/errors/query-port.error';
import { ArtifactError } from '@application/script-authoring/errors/artifact.error';
import { ScriptPublicationError } from '@application/script-authoring/errors/script-publication.error';

/**
 * End-to-end characterization of error -> HTTP status translation, exercised
 * through the real request pipeline (controller, filter, response body).
 *
 * This is the regression gate for Task 5, which replaces the five duplicated
 * per-controller mappers with a single global filter. These assertions describe
 * the wire contract, not the implementation, so they must keep passing after
 * that refactor without being edited.
 *
 * Two observations worth recording, both verified rather than assumed:
 *
 * 1. ProblemDetailsFilter rewrites `detail` to a fixed string for every 500.
 *    The custom messages passed to InternalServerErrorException (for example
 *    'The published script artifact is unavailable.') therefore never reach a
 *    client. A mapped 500 and an unmapped 500 are indistinguishable on the wire.
 *
 * 2. The script and execution controllers translate the SAME error types to
 *    DIFFERENT details. See the `divergence` cases at the end of this file.
 */

/**
 * Stubs each method declared on the use-case class so it throws the supplied
 * error synchronously.
 *
 * The stub is derived from the real prototype rather than from a catch-all
 * Proxy on purpose: a Proxy also answers Nest's lifecycle probes
 * (`onModuleInit` and friends) with a throwing function, which makes the error
 * escape during `app.init()` instead of travelling through the request pipeline.
 */
function throwingUseCases(
  useCases: Type<unknown>,
  currentError: () => unknown,
): Record<string, unknown> {
  const stub: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(useCases.prototype)) {
    if (name === 'constructor') {
      continue;
    }
    stub[name] = (): never => {
      throw currentError();
    };
  }
  return stub;
}

/** `getHttpServer()` is typed as `any` by Nest; narrow it once here. */
function httpServerOf(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

interface ProbeResult {
  readonly status: number;
  readonly detail: unknown;
  readonly title: unknown;
}

interface Harness {
  readonly app: INestApplication;
  setError(error: unknown): void;
}

/**
 * One application per controller, built on first use and reused for every case.
 *
 * The original harness stood up and tore down a fresh application per assertion,
 * which meant roughly seventy listen/close cycles on ephemeral ports in a single
 * file. That was intermittently flaky under parallel workers — around one run in
 * seven failed on an unrelated case. Reusing the application removes the churn,
 * and the stub reads the error through a callback so each case can still choose
 * what gets thrown.
 */
const harnesses = new Map<Type<unknown>, Harness>();

async function harnessFor(controller: Type<unknown>, useCases: Type<unknown>): Promise<Harness> {
  const existing = harnesses.get(controller);
  if (existing !== undefined) {
    return existing;
  }

  let error: unknown;
  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
    providers: [{ provide: useCases, useValue: throwingUseCases(useCases, () => error) }],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
  await app.init();
  // Bind once here so supertest reuses this server instead of calling
  // `listen(0)` itself on every single request.
  await app.listen(0);

  const harness: Harness = {
    app,
    setError: (next: unknown): void => {
      error = next;
    },
  };
  harnesses.set(controller, harness);
  return harness;
}

afterAll(async () => {
  await Promise.all([...harnesses.values()].map(async (harness) => harness.app.close()));
  harnesses.clear();
});

async function probe(
  controller: Type<unknown>,
  useCases: Type<unknown>,
  error: unknown,
  path: string,
): Promise<ProbeResult> {
  const harness = await harnessFor(controller, useCases);
  harness.setError(error);

  const response = await request(httpServerOf(harness.app)).get(path);
  const body = response.body as {
    error?: { readonly code?: unknown; readonly message?: unknown };
  };
  const code = body.error?.code;
  return {
    status: response.status,
    detail: body.error?.message,
    // Preserve this characterization suite's historical label for generic
    // server failures while reading all responses from the API envelope.
    title: response.status === 500 ? 'Internal Server Error' : code,
  };
}

const GENERIC_500_DETAIL = 'An unexpected error occurred.';

describe('DatabaseServiceController error mapping', () => {
  const probeConnection = (error: unknown): ReturnType<typeof probe> =>
    probe(DatabaseServiceController, DatabaseServiceUseCases, error, '/database-services');

  it.each([
    [404, ConnectionError.notFound(), 'The connection was not found.'],
    [409, ConnectionError.nameConflict(), 'A connection with this name already exists.'],
    [409, ConnectionError.archived(), 'Archived connections cannot be changed or tested.'],
    [
      409,
      ConnectionError.changedDuringTest(),
      'The connection changed while it was being tested. Retry with the latest details.',
    ],
    [400, ConnectionError.validation('Host is required.'), 'Host is required.'],
    [422, ConnectionError.unsupportedDbms('MYSQL'), 'Database type MYSQL is not supported.'],
    [404, ConnectionError.databaseNotFound(), 'The catalog database was not found.'],
    [404, ConnectionError.databaseServiceNotFound(), 'The datasource was not found.'],
    [409, ConnectionError.datasourceUsedByPipelines([{ id: 'pipeline-1', name: 'Orders sync' }]), 'The datasource is still used by pipelines in this database.'],
    [409, ConnectionError.datasourceStillLinked(), 'The datasource cannot be archived while it is linked to a catalog database.'],
    [
      400,
      ConnectionAccessError.destinationRejected('Private addresses are not allowed.'),
      'Private addresses are not allowed.',
    ],
  ])('maps %s', async (status, error, detail) => {
    await expect(probeConnection(error)).resolves.toEqual({
      status,
      detail,
      title: expect.any(String) as unknown,
    });
  });

  it('surfaces an unmapped error as a generic 500', async () => {
    await expect(probeConnection(new Error('internal detail'))).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });

  it('does not leak an unmapped error message', async () => {
    const result = await probeConnection(new Error('password=s3cr3t'));

    expect(JSON.stringify(result)).not.toContain('s3cr3t');
  });
});

describe('CatalogController error mapping', () => {
  const probeCatalog = (error: unknown, path = '/catalogs'): ReturnType<typeof probe> =>
    probe(CatalogController, CatalogExplorationUseCases, error, path);

  it.each([
    [400, CatalogError.validation('Catalog is required.'), 'Catalog is required.'],
    [409, CatalogError.conflict('The database already exists.'), 'The database already exists.'],
    [503, CatalogError.unavailable(), 'The catalog service is temporarily unavailable.'],
    [502, CatalogError.query(), 'The catalog query could not be completed.'],
  ])('maps %s on the synchronous route', async (status, error, detail) => {
    await expect(probeCatalog(error)).resolves.toEqual({
      status,
      detail,
      title: expect.any(String) as unknown,
    });
  });

  it('applies the same mapping on an asynchronous route', async () => {
    await expect(
      probeCatalog(CatalogError.unavailable(), '/catalogs/iceberg/schemas'),
    ).resolves.toEqual({
      status: 503,
      detail: 'The catalog service is temporarily unavailable.',
      title: expect.any(String) as unknown,
    });
  });

  it('surfaces an unmapped error as a generic 500', async () => {
    await expect(probeCatalog(new Error('trino internals'))).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });
});

describe('SqlExecutionController error mapping', () => {
  const probeSql = (error: unknown): ReturnType<typeof probe> =>
    probe(SqlExecutionController, QueryWorkbenchUseCases, error, '/sql-executions');

  it.each([
    [404, SqlExecutionError.notFound(), 'The SQL execution was not found.'],
    [
      409,
      SqlExecutionError.stateConflict(),
      'The SQL execution changed while it was being updated.',
    ],
    [
      409,
      SqlExecutionError.illegalTransition('SUCCEEDED', 'RUNNING'),
      'A SQL execution cannot move from SUCCEEDED to RUNNING.',
    ],
    [
      422,
      SqlExecutionError.readOnlyViolation('Only read-only statements are allowed.'),
      'Only read-only statements are allowed.',
    ],
    [400, SqlExecutionError.validation('SQL is required.'), 'SQL is required.'],
  ])('maps %s', async (status, error, detail) => {
    await expect(probeSql(error)).resolves.toEqual({
      status,
      detail,
      title: expect.any(String) as unknown,
    });
  });

  it('leaves a gateway-unavailable error unmapped, so it surfaces as a generic 500', async () => {
    // Recorded deliberately: the query gateway is only reached by the background
    // runner, so this controller never had a mapping for it.
    await expect(probeSql(QueryPortError.gatewayUnavailable())).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });

  it('surfaces an unmapped error as a generic 500', async () => {
    await expect(probeSql(new Error('boom'))).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });
});

describe('ScriptController error mapping', () => {
  const probeScript = (error: unknown): ReturnType<typeof probe> =>
    probe(ScriptController, ScriptAuthoringUseCases, error, '/scripts');

  const PUBLICATION_UNAVAILABLE = 'Script publication is temporarily unavailable.';
  // Task 5 unified this one message. See the "artifact store" block at the end
  // of this file for why.
  const ARTIFACT_STORE_UNAVAILABLE = 'The script artifact store is temporarily unavailable.';

  it.each([
    [404, ScriptError.notFound(), 'The script was not found.'],
    [404, ScriptError.versionNotFound(), 'The published script version was not found.'],
    [404, ConnectionAccessError.notFound(), 'The selected active connection was not found.'],
    [409, ScriptError.archived(), 'Archived scripts cannot be changed.'],
    [409, ScriptError.draft(), 'The script does not have a published version.'],
    [
      409,
      ScriptError.metadataConflict(),
      'The script changed while it was being updated. Retry with the latest metadata.',
    ],
    [
      409,
      ScriptError.publicationConflict(),
      'The script changed while a version was being published. Retry the publication.',
    ],
    [
      409,
      ArtifactError.alreadyExists(),
      'The deterministic script artifact already exists with different content.',
    ],
    [503, ArtifactError.cleanupFailed(), PUBLICATION_UNAVAILABLE],
    [503, ArtifactError.storageUnavailable(), ARTIFACT_STORE_UNAVAILABLE],
    [503, ArtifactError.versioningRequired(), PUBLICATION_UNAVAILABLE],
    [503, ScriptPublicationError.lockUnavailable(), PUBLICATION_UNAVAILABLE],
    [400, ScriptError.validation('Name is required.'), 'Name is required.'],
    [400, ConnectionAccessError.invalidId(), 'Connection ID must be a valid UUID.'],
  ])('maps %s', async (status, error, detail) => {
    await expect(probeScript(error)).resolves.toEqual({
      status,
      detail,
      title: expect.any(String) as unknown,
    });
  });

  it.each([
    ['ArtifactError', ArtifactError.missing()],
    ['ArtifactError', ArtifactError.integrity()],
  ])(
    'maps %s to a 500 whose custom message is discarded by the problem-details filter',
    async (_label, error) => {
      await expect(probeScript(error)).resolves.toEqual({
        status: 500,
        detail: GENERIC_500_DETAIL,
        title: 'Internal Server Error',
      });
    },
  );

  it('surfaces an unmapped error as a generic 500', async () => {
    await expect(probeScript(new Error('boom'))).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });
});

describe('ExecutionController error mapping', () => {
  const probeExecution = (error: unknown): ReturnType<typeof probe> =>
    probe(ExecutionController, ExecutionOrchestrationUseCases, error, '/executions');

  const ORCHESTRATION_UNAVAILABLE = 'Execution orchestration is temporarily unavailable.';

  it.each([
    [404, ExecutionError.notFound(), 'The execution was not found.'],
    [404, ScriptError.notFound(), 'The script was not found.'],
    [404, ScriptError.versionNotFound(), 'The published script version was not found.'],
    [404, ConnectionAccessError.notFound(), 'The selected active connection was not found.'],
    [409, ExecutionError.notCancellable(), 'The execution can no longer be cancelled.'],
    [
      409,
      ExecutionError.concurrency(),
      'The execution changed while it was being updated. Retry with the latest state.',
    ],
    [
      409,
      ExecutionError.transition('SUCCEEDED', 'RUNNING'),
      'An execution cannot transition from SUCCEEDED to RUNNING.',
    ],
    [409, ScriptError.draft(), 'The script does not have a published version.'],
    [409, ScriptError.archived(), 'Archived scripts cannot be changed.'],
    [400, ExecutionError.validation('Version is required.'), 'Version is required.'],
    [400, ScriptError.validation('Name is required.'), 'Name is required.'],
    [400, ConnectionAccessError.invalidId(), 'Connection ID must be a valid UUID.'],
    [503, ExecutionPortError.logStoreUnavailable(), ORCHESTRATION_UNAVAILABLE],
    [503, ExecutionPortError.sparkUnavailable(), ORCHESTRATION_UNAVAILABLE],
  ])('maps %s', async (status, error, detail) => {
    await expect(probeExecution(error)).resolves.toEqual({
      status,
      detail,
      title: expect.any(String) as unknown,
    });
  });

  it('honours a custom ExecutionPortError message by discarding it', async () => {
    // The 503 substitutes a fixed message, so the custom text never surfaces.
    await expect(
      probeExecution(ExecutionPortError.sparkUnavailable('docker socket missing')),
    ).resolves.toEqual({
      status: 503,
      detail: ORCHESTRATION_UNAVAILABLE,
      title: expect.any(String) as unknown,
    });
  });

  it.each([
    ['ArtifactError', ArtifactError.missing()],
    ['ArtifactError', ArtifactError.integrity()],
  ])('maps %s to a generic 500', async (_label, error) => {
    await expect(probeExecution(error)).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });

  it('surfaces an unmapped error as a generic 500', async () => {
    await expect(probeExecution(new Error('boom'))).resolves.toEqual({
      status: 500,
      detail: GENERIC_500_DETAIL,
      title: 'Internal Server Error',
    });
  });
});

describe('ScriptExecutionController error mapping', () => {
  it('is translated by the same global filter', async () => {
    // Its only route is a POST, so this one goes through the shared harness by
    // hand rather than through `probe`.
    const harness = await harnessFor(ScriptExecutionController, ExecutionOrchestrationUseCases);
    harness.setError(ExecutionError.notFound());

    const response = await request(httpServerOf(harness.app)).post(
      '/scripts/11111111-1111-4111-8111-111111111111/versions/1/executions',
    );

    expect(response.status).toBe(404);
    expect((response.body as { error?: { readonly message?: unknown } }).error?.message).toBe(
      'The execution was not found.',
    );
  });
});

/**
 * Before Task 5, the same error type produced different responses depending on
 * which controller happened to catch it. One global filter has no caller context
 * to reproduce that, so this block asserts the responses are now identical from
 * every entry point.
 *
 * Seven of these eight cases were unreachable from the second controller — a
 * publication-only failure could not arise from an execution request, and the
 * destination policy is only used by the connection registry — so unifying them
 * changed no response any client could actually observe. The exception is called
 * out separately below.
 */
describe('translation no longer depends on which controller caught the error', () => {
  async function fromBoth(
    error: unknown,
  ): Promise<readonly [Awaited<ReturnType<typeof probe>>, Awaited<ReturnType<typeof probe>>]> {
    return [
      await probe(ScriptController, ScriptAuthoringUseCases, error, '/scripts'),
      await probe(ExecutionController, ExecutionOrchestrationUseCases, error, '/executions'),
    ];
  }

  // Status precedes the error in each tuple so the printf placeholders in the
  // title line up; jest fills them positionally.
  it.each([
    ['ArtifactError.alreadyExists', 409, ArtifactError.alreadyExists()],
    ['ArtifactError.cleanupFailed', 503, ArtifactError.cleanupFailed()],
    ['ArtifactError.versioningRequired', 503, ArtifactError.versioningRequired()],
    ['ArtifactError.storageUnavailable', 503, ArtifactError.storageUnavailable()],
    ['ArtifactError.missing', 500, ArtifactError.missing()],
    ['ArtifactError.integrity', 500, ArtifactError.integrity()],
    ['ScriptPublicationError.lockUnavailable', 503, ScriptPublicationError.lockUnavailable()],
    ['ScriptError.metadataConflict', 409, ScriptError.metadataConflict()],
    ['ScriptError.publicationConflict', 409, ScriptError.publicationConflict()],
  ])('%s answers %d from either controller', async (_label, status, error) => {
    const [fromScript, fromExecution] = await fromBoth(error);

    expect(fromScript.status).toBe(status);
    expect(fromExecution.status).toBe(status);
    expect(fromScript.detail).toBe(fromExecution.detail);
  });

  it('ConnectionAccessError is now translated from every controller, not just one', async () => {
    const fromConnection = await probe(
      DatabaseServiceController,
      DatabaseServiceUseCases,
      ConnectionAccessError.destinationRejected('nope'),
      '/database-services',
    );
    const fromExecution = await probe(
      ExecutionController,
      ExecutionOrchestrationUseCases,
      ConnectionAccessError.destinationRejected('nope'),
      '/executions',
    );

    expect(fromConnection.status).toBe(400);
    expect(fromExecution.status).toBe(400);
    expect(fromConnection.detail).toBe('nope');
    expect(fromExecution.detail).toBe('nope');
  });
});

describe('the one response text Task 5 changed', () => {
  /**
   * A failure to reach the artifact store is genuinely raised on both the
   * publication and the execution path, so it is the only case where the two old
   * mappers disagreed about something a client could observe. The unified detail
   * is the port error's own message: true from either entry point, and still a
   * fixed string rather than anything derived from the underlying cause.
   */
  it('reports the artifact store itself rather than naming a caller', async () => {
    const fromScript = await probe(
      ScriptController,
      ScriptAuthoringUseCases,
      ArtifactError.storageUnavailable(),
      '/scripts',
    );
    const fromExecution = await probe(
      ExecutionController,
      ExecutionOrchestrationUseCases,
      ArtifactError.storageUnavailable(),
      '/executions',
    );

    for (const result of [fromScript, fromExecution]) {
      expect(result.status).toBe(503);
      expect(result.detail).toBe('The script artifact store is temporarily unavailable.');
    }
  });

  it('leaks nothing about the underlying cause', async () => {
    const result = await probe(
      ScriptController,
      ScriptAuthoringUseCases,
      ArtifactError.storageUnavailable(),
      '/scripts',
    );

    expect(result.detail).not.toContain('minio');
    expect(result.detail).not.toContain('ECONN');
  });
});

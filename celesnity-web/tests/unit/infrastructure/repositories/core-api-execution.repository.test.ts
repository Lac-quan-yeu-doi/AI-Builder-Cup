import { describe, expect, it } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { ExecutionDetail } from '@/src/entities/models/execution';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { CoreApiExecutionRepository } from '@/src/infrastructure/repositories/core-api-execution.repository';

type ExecutionResponseDto = components['schemas']['ExecutionResponseDto'];
type ExecutionAcceptedResponseDto = components['schemas']['ExecutionAcceptedResponseDto'];
type ExecutionLogResponseDto = components['schemas']['ExecutionLogResponseDto'];
type ScriptVersionResponseDto = components['schemas']['ScriptVersionResponseDto'];

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

const executionDto: ExecutionResponseDto = {
  id: 'execution-1',
  workloadKind: 'SCRIPT',
  executionPrincipal: 'BACKGROUND',
  versionNumber: 2,
  scriptId: 'script-1',
  scriptVersionId: 'version-2',
  connectionId: 'connection-1',
  status: 'FAILED',
  sparkApplicationId: 'application-1',
  resourceProfile: {
    driverMemory: '1g',
    executorMemory: '2g',
    executorCores: 2,
    maxCores: 4,
  },
  exitCode: 1,
  errorSummary: 'failed',
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:01:00.000Z',
  finishedAt: '2026-08-10T08:02:00.000Z',
  cancelledAt: '2026-08-10T08:01:30.000Z',
  updatedAt: '2026-08-10T08:02:00.000Z',
};

const mappedExecution = {
  id: 'execution-1',
  workloadKind: 'SCRIPT',
  executionPrincipal: 'BACKGROUND',
  versionNumber: 2,
  scriptId: 'script-1',
  scriptVersionId: 'version-2',
  connectionId: 'connection-1',
  status: 'failed',
  sparkApplicationId: 'application-1',
  resourceProfile: {
    driverMemory: '1g',
    executorMemory: '2g',
    executorCores: 2,
    maxCores: 4,
  },
  exitCode: 1,
  errorSummary: 'failed',
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:01:00.000Z',
  finishedAt: '2026-08-10T08:02:00.000Z',
  cancelledAt: '2026-08-10T08:01:30.000Z',
  updatedAt: '2026-08-10T08:02:00.000Z',
} as const;

const versionDto: ScriptVersionResponseDto = {
  id: 'version-2',
  scriptId: 'script-1',
  versionNumber: 2,
  artifactBucket: 'scripts',
  objectKey: 'script-1/2.py',
  contentSha256: 'sha-2',
  contentSize: 42,
  publishedAt: '2026-08-10T07:00:00.000Z',
};

describe('CoreApiExecutionRepository request-response operations', () => {
  it('lists executions and maps every optional field into copied entities', async () => {
    const response = [executionDto];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiExecutionRepository(transport);

    const result = await repository.list();

    expect(transport.requests).toEqual([{ path: '/executions', init: { method: 'GET' } }]);
    expect(result).toEqual([mappedExecution]);
    expect(result).not.toBe(response);
    expect(result[0]).not.toBe(executionDto);
    expect((result[0] as ExecutionDetail | undefined)?.resourceProfile).not.toBe(
      executionDto.resourceProfile,
    );
  });

  it('gets and cancels an encoded execution while omitting absent optional fields', async () => {
    const minimal: ExecutionResponseDto = {
      ...executionDto,
      status: 'RUNNING',
      sparkApplicationId: undefined,
      resourceProfile: undefined,
      exitCode: undefined,
      errorSummary: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      cancelledAt: undefined,
    };
    const transport = new FakeGeneratedApiTransport(minimal, minimal);
    const repository = new CoreApiExecutionRepository(transport);

    const loaded = await repository.get('execution/one');
    const cancelled = await repository.cancel('execution/one');

    expect(transport.requests).toEqual([
      { path: '/executions/execution%2Fone', init: { method: 'GET' } },
      { path: '/executions/execution%2Fone/cancel', init: { method: 'POST' } },
    ]);
    expect(loaded).toEqual({
      id: 'execution-1',
      workloadKind: 'SCRIPT',
      executionPrincipal: 'BACKGROUND',
      versionNumber: 2,
      scriptId: 'script-1',
      scriptVersionId: 'version-2',
      connectionId: 'connection-1',
      status: 'running',
      queuedAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:02:00.000Z',
    });
    expect(cancelled).toEqual(loaded);
    expect(cancelled).not.toBe(loaded);
  });

  it('maps an execution log and returns a copied model', async () => {
    const logDto: ExecutionLogResponseDto = {
      executionId: 'execution-1',
      status: 'SUCCEEDED',
      bucket: 'execution-logs',
      objectKey: 'execution-1.log',
      content: 'done',
      byteSize: 4,
    };
    const transport = new FakeGeneratedApiTransport(logDto);
    const repository = new CoreApiExecutionRepository(transport);

    const log = await repository.fetchLogs('execution/one');
    expect(transport.requests).toEqual([
      { path: '/executions/execution%2Fone/logs', init: { method: 'GET' } },
    ]);
    expect(log).toEqual({
      executionId: 'execution-1',
      status: 'succeeded',
      bucket: 'execution-logs',
      objectKey: 'execution-1.log',
      content: 'done',
      byteSize: 4,
    });
    expect(log).not.toBe(logDto);
  });

  it.each([404, 409, 425])('returns undefined while a log is not ready (%i)', async (status) => {
    const repository = new CoreApiExecutionRepository(
      new FakeGeneratedApiTransport(new CoreApiError(status, 'not ready')),
    );

    await expect(repository.fetchLogs('execution-1')).resolves.toBeUndefined();
  });

  it('translates other log failures instead of leaking Core API errors', async () => {
    const repository = new CoreApiExecutionRepository(
      new FakeGeneratedApiTransport(new CoreApiError(500, 'unavailable')),
    );

    await expect(repository.fetchLogs('execution-1')).rejects.toBeInstanceOf(RemoteServiceError);
  });
});

describe('CoreApiExecutionRepository rerun', () => {
  it('resolves the exact script version ID and starts its version number', async () => {
    const accepted: ExecutionAcceptedResponseDto = {
      executionId: 'execution-2',
      status: 'QUEUED',
    };
    const transport = new FakeGeneratedApiTransport(
      [{ ...versionDto, id: 'version-1', versionNumber: 1 }, versionDto],
      accepted,
    );
    const repository = new CoreApiExecutionRepository(transport);

    const result = await repository.rerun('script/one', 'version-2');

    expect(transport.requests).toEqual([
      { path: '/scripts/script%2Fone/versions', init: { method: 'GET' } },
      {
        path: '/scripts/script%2Fone/versions/2/executions',
        init: { method: 'POST' },
      },
    ]);
    expect(result).toEqual({ kind: 'started', executionId: 'execution-2', status: 'queued' });
  });

  it('does not start an execution when the requested immutable version ID is absent', async () => {
    const transport = new FakeGeneratedApiTransport([versionDto]);
    const repository = new CoreApiExecutionRepository(transport);

    const result = await repository.rerun('script-1', 'missing-version');

    expect(result).toEqual({ kind: 'version-missing' });
    expect(transport.requests).toEqual([
      { path: '/scripts/script-1/versions', init: { method: 'GET' } },
    ]);
  });

  it.each([
    ['version lookup', new CoreApiError(404, 'missing'), undefined],
    ['execution start', [versionDto], new CoreApiError(404, 'missing')],
  ])('maps a 404 during %s to version-missing', async (_label, first, second) => {
    const transport = new FakeGeneratedApiTransport(first, second);
    const repository = new CoreApiExecutionRepository(transport);

    await expect(repository.rerun('script-1', 'version-2')).resolves.toEqual({
      kind: 'version-missing',
    });
  });

  it('maps an execution-start conflict while preserving the translated message', async () => {
    const transport = new FakeGeneratedApiTransport(
      [versionDto],
      new CoreApiError(409, 'already running'),
    );
    const repository = new CoreApiExecutionRepository(transport);

    await expect(repository.rerun('script-1', 'version-2')).resolves.toEqual({
      kind: 'conflict',
      message: 'already running',
    });
  });

  it('translates unexpected rerun failures into application errors', async () => {
    const repository = new CoreApiExecutionRepository(
      new FakeGeneratedApiTransport(new CoreApiError(500, 'unavailable')),
    );

    await expect(repository.rerun('script-1', 'version-2')).rejects.toBeInstanceOf(
      RemoteServiceError,
    );
  });
});

import { describe, expect, it } from 'vitest';

import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import { createCancelExecutionUseCase } from '@/src/application/use-cases/executions/cancel-execution.use-case';
import { createGetExecutionLogsUseCase } from '@/src/application/use-cases/executions/get-execution-logs.use-case';
import { createGetExecutionUseCase } from '@/src/application/use-cases/executions/get-execution.use-case';
import { createListExecutionsUseCase } from '@/src/application/use-cases/executions/list-executions.use-case';
import { createRerunExecutionUseCase } from '@/src/application/use-cases/executions/rerun-execution.use-case';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';

function execution(overrides: Partial<ExecutionDetail> = {}): ExecutionDetail {
  return {
    id: 'execution-1',
    workloadKind: 'SCRIPT',
    versionNumber: 1,
    scriptId: 'script-1',
    scriptVersionId: 'version-1',
    connectionId: 'connection-1',
    status: 'running',
    queuedAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:01:00.000Z',
    ...overrides,
  };
}

class RecordingExecutionRepository implements ExecutionRepository {
  public executions: readonly ExecutionSummary[] = [];
  public detail = execution();
  public log: ExecutionLog | undefined = {
    executionId: 'execution-1',
    status: 'running',
    bucket: 'logs',
    objectKey: 'execution-1.log',
    content: 'running',
    byteSize: 7,
  };
  public rerunOutcome: RerunOutcome = {
    kind: 'started',
    executionId: 'execution-2',
    status: 'queued',
  };

  public readonly calls: string[] = [];
  public readonly ids: string[] = [];
  public readonly reruns: { scriptId: string; scriptVersionId: string }[] = [];

  public async list(): Promise<readonly ExecutionSummary[]> {
    this.calls.push('list');
    return this.executions;
  }

  public async get(id: string): Promise<ExecutionDetail> {
    this.calls.push('get');
    this.ids.push(id);
    return this.detail;
  }

  public async cancel(id: string): Promise<ExecutionDetail> {
    this.calls.push('cancel');
    this.ids.push(id);
    return this.detail;
  }

  public async fetchLogs(id: string): Promise<ExecutionLog | undefined> {
    this.calls.push('fetchLogs');
    this.ids.push(id);
    return this.log;
  }

  public async rerun(scriptId: string, scriptVersionId: string): Promise<RerunOutcome> {
    this.calls.push('rerun');
    this.reruns.push({ scriptId, scriptVersionId });
    return this.rerunOutcome;
  }
}

describe('execution request-response use cases', () => {
  it('sorts executions newest-first without mutating the source and uses descending IDs for ties', async () => {
    const repository = new RecordingExecutionRepository();
    const source = [
      execution({ id: 'invalid-b', queuedAt: 'not-a-date' }),
      execution({ id: 'same-a', queuedAt: '2026-08-10T09:00:00.000Z' }),
      execution({ id: 'old', queuedAt: '2026-08-09T09:00:00.000Z' }),
      execution({ id: 'invalid-a', queuedAt: 'also-not-a-date' }),
      execution({ id: 'same-z', queuedAt: '2026-08-10T09:00:00.000Z' }),
    ] as const;
    repository.executions = source;

    const result = await createListExecutionsUseCase(repository)();

    expect(result.map(({ id }) => id)).toEqual([
      'same-z',
      'same-a',
      'old',
      'invalid-b',
      'invalid-a',
    ]);
    expect(source.map(({ id }) => id)).toEqual([
      'invalid-b',
      'same-a',
      'old',
      'invalid-a',
      'same-z',
    ]);
    expect(repository.calls).toEqual(['list']);
  });

  it('forwards get, cancel, and log reads exactly once and returns repository values unchanged', async () => {
    const repository = new RecordingExecutionRepository();

    const detail = await createGetExecutionUseCase(repository)('execution/get');
    const cancelled = await createCancelExecutionUseCase(repository)('execution/cancel');
    const log = await createGetExecutionLogsUseCase(repository)('execution/log');

    expect(detail).toBe(repository.detail);
    expect(cancelled).toBe(repository.detail);
    expect(log).toBe(repository.log);
    expect(repository.calls).toEqual(['get', 'cancel', 'fetchLogs']);
    expect(repository.ids).toEqual(['execution/get', 'execution/cancel', 'execution/log']);
  });

  it('reruns the exact immutable script version and returns its outcome unchanged', async () => {
    const repository = new RecordingExecutionRepository();
    const input = { scriptId: 'script/one', scriptVersionId: 'version/two' } as const;

    const result = await createRerunExecutionUseCase(repository)(input);

    expect(result).toBe(repository.rerunOutcome);
    expect(repository.calls).toEqual(['rerun']);
    expect(repository.reruns).toEqual([input]);
  });
});

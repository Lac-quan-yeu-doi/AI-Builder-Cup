import { describe, expect, it } from 'vitest';

import type {
  ExecutionMonitorHandlers,
  ExecutionMonitorMode,
} from '@/src/application/use-cases/executions/monitor-execution.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionProgress,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';
import { createCancelExecutionController } from '@/src/interface-adapters/controllers/executions/cancel-execution.controller';
import { createGetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import { createGetExecutionController } from '@/src/interface-adapters/controllers/executions/get-execution.controller';
import { createListExecutionsController } from '@/src/interface-adapters/controllers/executions/list-executions.controller';
import { createMonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import { createRerunExecutionController } from '@/src/interface-adapters/controllers/executions/rerun-execution.controller';

const detail: ExecutionDetail = {
  id: 'execution-1',
  workloadKind: 'SCRIPT',
  versionNumber: 1,
  scriptId: 'script-1',
  scriptVersionId: 'version-1',
  connectionId: 'connection-1',
  status: 'running',
  sparkApplicationId: 'application-1',
  resourceProfile: {
    driverMemory: '1g',
    executorMemory: '2g',
    executorCores: 2,
    maxCores: 4,
  },
  exitCode: 0,
  errorSummary: 'none',
  queuedAt: '2026-08-10T08:00:00.000Z',
  startedAt: '2026-08-10T08:01:00.000Z',
  finishedAt: '2026-08-10T08:02:00.000Z',
  cancelledAt: '2026-08-10T08:01:30.000Z',
  updatedAt: '2026-08-10T08:02:00.000Z',
};

const log: ExecutionLog = {
  executionId: 'execution-1',
  status: 'running',
  bucket: 'execution-logs',
  objectKey: 'execution-1.log',
  content: 'running',
  byteSize: 7,
};

const progress: ExecutionProgress = {
  id: 'execution-1',
  status: 'running',
  sparkApplicationId: 'application-1',
  exitCode: 0,
  updatedAt: '2026-08-10T08:02:00.000Z',
};

const summary: ExecutionSummary = {
  id: detail.id,
  workloadKind: detail.workloadKind,
  versionNumber: detail.versionNumber,
  ...(detail.scriptId ? { scriptId: detail.scriptId } : {}),
  ...(detail.scriptVersionId ? { scriptVersionId: detail.scriptVersionId } : {}),
  connectionId: detail.connectionId,
  status: detail.status,
  sparkApplicationId: detail.sparkApplicationId,
  exitCode: detail.exitCode,
  errorSummary: detail.errorSummary,
  queuedAt: detail.queuedAt,
  startedAt: detail.startedAt,
  finishedAt: detail.finishedAt,
  updatedAt: detail.updatedAt,
};

describe('execution request-response controllers', () => {
  it('lists executions once and presents copied summaries', async () => {
    let calls = 0;
    const source = [summary] as const;
    const controller = createListExecutionsController(async () => {
      calls += 1;
      return source;
    });

    const result = await controller();

    expect(calls).toBe(1);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(summary);
  });

  it('gets and cancels unchanged string IDs and presents independent details', async () => {
    const getIds: string[] = [];
    const cancelIds: string[] = [];
    const getController = createGetExecutionController(async (id) => {
      getIds.push(id);
      return detail;
    });
    const cancelController = createCancelExecutionController(async (id) => {
      cancelIds.push(id);
      return detail;
    });

    const loaded = await getController('');
    const cancelled = await cancelController('execution/one');

    expect(getIds).toEqual(['']);
    expect(cancelIds).toEqual(['execution/one']);
    expect(loaded).toEqual(detail);
    expect(cancelled).toEqual(detail);
    expect(loaded).not.toBe(detail);
    expect(cancelled).not.toBe(detail);
    expect(loaded.resourceProfile).not.toBe(detail.resourceProfile);
  });

  it('gets a copied log or preserves its not-ready undefined state', async () => {
    const readyController = createGetExecutionLogsController(async () => log);
    const waitingController = createGetExecutionLogsController(async () => undefined);

    const ready = await readyController('execution-1');
    const waiting = await waitingController('execution-1');

    expect(ready).toEqual(log);
    expect(ready).not.toBe(log);
    expect(waiting).toBeUndefined();
  });

  it.each([
    ['get', createGetExecutionController(async () => detail)],
    ['cancel', createCancelExecutionController(async () => detail)],
    ['logs', createGetExecutionLogsController(async () => log)],
  ])('rejects a non-string ID before invoking %s', async (_label, controller) => {
    await expect(controller(42 as unknown as string)).rejects.toBeInstanceOf(InputParseError);
  });

  it('reruns both exact immutable identifiers and returns a copied outcome', async () => {
    const received: { scriptId: string; scriptVersionId: string }[] = [];
    const outcome: RerunOutcome = {
      kind: 'started',
      executionId: 'execution-2',
      status: 'queued',
    };
    const controller = createRerunExecutionController(async (execution) => {
      received.push(execution);
      return outcome;
    });

    const result = await controller({ scriptId: 'script/one', scriptVersionId: '' });

    expect(received).toEqual([{ scriptId: 'script/one', scriptVersionId: '' }]);
    expect(result).toEqual(outcome);
    expect(result).not.toBe(outcome);
  });

  it('rejects invalid rerun identifiers before invoking the use case', async () => {
    let calls = 0;
    const controller = createRerunExecutionController(async () => {
      calls += 1;
      return { kind: 'version-missing' };
    });

    await expect(
      controller({ scriptId: 'script-1', scriptVersionId: 2 as unknown as string }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });
});

describe('monitor execution controller', () => {
  it('validates the ID, calls one monitor use case, and presents copied callbacks', () => {
    const ids: string[] = [];
    let applicationHandlers: ExecutionMonitorHandlers | undefined;
    let closeCalls = 0;
    const monitor = { close: () => (closeCalls += 1) };
    const controller = createMonitorExecutionController((id, handlers) => {
      ids.push(id);
      applicationHandlers = handlers;
      return monitor;
    });
    const snapshots: ExecutionDetail[] = [];
    const progresses: ExecutionProgress[] = [];
    const modes: ExecutionMonitorMode[] = [];
    const errors: unknown[] = [];
    const failure = new Error('poll failed');

    const returned = controller('execution/one', {
      onSnapshot: (value) => snapshots.push(value),
      onProgress: (value) => progresses.push(value),
      onMode: (value) => modes.push(value),
      onError: (value) => errors.push(value),
    });
    applicationHandlers?.onSnapshot(detail);
    applicationHandlers?.onProgress(progress);
    applicationHandlers?.onMode('polling');
    applicationHandlers?.onError(failure);
    returned.close();

    expect(ids).toEqual(['execution/one']);
    expect(returned).toBe(monitor);
    expect(closeCalls).toBe(1);
    expect(snapshots).toEqual([detail]);
    expect(snapshots[0]).not.toBe(detail);
    expect(snapshots[0]?.resourceProfile).not.toBe(detail.resourceProfile);
    expect(progresses).toEqual([progress]);
    expect(progresses[0]).not.toBe(progress);
    expect(modes).toEqual(['polling']);
    expect(errors).toEqual([failure]);
  });

  it('rejects a non-string monitor ID before creating a monitor', () => {
    let calls = 0;
    const controller = createMonitorExecutionController(() => {
      calls += 1;
      return { close: () => undefined };
    });

    expect(() =>
      controller(42 as unknown as string, {
        onSnapshot: () => undefined,
        onProgress: () => undefined,
        onMode: () => undefined,
        onError: () => undefined,
      }),
    ).toThrow(InputParseError);
    expect(calls).toBe(0);
  });
});

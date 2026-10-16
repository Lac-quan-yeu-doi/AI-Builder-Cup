import { describe, expect, it, vi } from 'vitest';

import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import { createMonitorTablePreviewUseCase } from '@/src/application/use-cases/catalog/monitor-table-preview.use-case';
import type { TablePreview } from '@/src/entities/models/catalog';

class ManualScheduler implements SchedulerService {
  public task?: () => void;
  public cancelled = false;

  public every(intervalMs: number, task: () => void): ScheduledTask {
    expect(intervalMs).toBe(15_000);
    this.task = task;
    return { cancel: () => (this.cancelled = true) };
  }
}

const request = {
  catalog: 'iceberg',
  schema: 'tnt_factory_bronze',
  table: 'mqtt_events',
  deviceId: '78a5815e-076c-48b6-b812-81f6422c5f93',
} as const;

const preview: TablePreview = {
  columns: [{ name: 'device_id', type: 'varchar' }],
  rows: [[request.deviceId]],
  rowCount: 1,
};

describe('monitor table preview', () => {
  it('loads immediately, refreshes on schedule, and cancels cleanly', async () => {
    const scheduler = new ManualScheduler();
    const previewTable = vi.fn().mockResolvedValue(preview);
    const onSnapshot = vi.fn();
    const monitor = createMonitorTablePreviewUseCase(previewTable, scheduler)(request, {
      onSnapshot,
      onError: vi.fn(),
    });

    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
    scheduler.task?.();
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));
    expect(previewTable).toHaveBeenCalledWith(request);

    monitor.close();
    scheduler.task?.();
    await Promise.resolve();
    expect(scheduler.cancelled).toBe(true);
    expect(previewTable).toHaveBeenCalledTimes(2);
  });

  it('skips scheduled refreshes while one is in flight instead of queueing another', async () => {
    const scheduler = new ManualScheduler();
    let resolvePreview: ((value: TablePreview) => void) | undefined;
    const previewTable = vi.fn(
      () =>
        new Promise<TablePreview>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const onSnapshot = vi.fn();
    const monitor = createMonitorTablePreviewUseCase(previewTable, scheduler)(request, {
      onSnapshot,
      onError: vi.fn(),
    });

    expect(previewTable).toHaveBeenCalledTimes(1);
    scheduler.task?.();
    scheduler.task?.();
    expect(previewTable).toHaveBeenCalledTimes(1);

    resolvePreview?.(preview);
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(previewTable).toHaveBeenCalledTimes(1);

    scheduler.task?.();
    expect(previewTable).toHaveBeenCalledTimes(2);
    monitor.close();
  });

  it('backs off for one interval after a failed refresh', async () => {
    const scheduler = new ManualScheduler();
    const previewTable = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(preview);
    const onError = vi.fn();
    const monitor = createMonitorTablePreviewUseCase(previewTable, scheduler)(request, {
      onSnapshot: vi.fn(),
      onError,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    scheduler.task?.();
    await Promise.resolve();
    expect(previewTable).toHaveBeenCalledTimes(1);

    scheduler.task?.();
    await vi.waitFor(() => expect(previewTable).toHaveBeenCalledTimes(2));
    monitor.close();
  });
});

import type { SchedulerService } from '@/src/application/services/scheduler.service.interface';
import type { TablePreview, TablePreviewRequest } from '@/src/entities/models/catalog';

import type { PreviewTableUseCase } from './preview-table.use-case';

const REFRESH_INTERVAL_MS = 15_000;

export interface TablePreviewMonitorHandlers {
  onSnapshot(preview: TablePreview): void;
  onError(error: unknown): void;
}

export interface TablePreviewMonitor {
  close(): void;
}

export type MonitorTablePreviewUseCase = ReturnType<typeof createMonitorTablePreviewUseCase>;

export const createMonitorTablePreviewUseCase =
  (previewTable: PreviewTableUseCase, scheduler: SchedulerService) =>
  (request: TablePreviewRequest, handlers: TablePreviewMonitorHandlers): TablePreviewMonitor => {
    let disposed = false;
    let refreshing = false;
    let backOffNextRefresh = false;

    const refresh = async (): Promise<void> => {
      if (disposed) return;
      if (refreshing) {
        return;
      }

      refreshing = true;
      try {
        const preview = await previewTable(request);
        if (!disposed) handlers.onSnapshot(preview);
      } catch (error) {
        backOffNextRefresh = true;
        if (!disposed) handlers.onError(error);
      } finally {
        refreshing = false;
      }
    };

    const task = scheduler.every(REFRESH_INTERVAL_MS, () => {
      if (backOffNextRefresh) {
        backOffNextRefresh = false;
        return;
      }
      void refresh();
    });
    void refresh();

    return {
      close: () => {
        disposed = true;
        backOffNextRefresh = false;
        task.cancel();
      },
    };
  };

import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type {
  ExecutionProgressService,
  ExecutionProgressSubscription,
} from '@/src/application/services/execution-progress.service.interface';
import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import {
  isTerminalExecution,
  type ExecutionDetail,
  type ExecutionProgress,
} from '@/src/entities/models/execution';

const POLL_INTERVAL_MS = 3000;

export type ExecutionMonitorMode = 'idle' | 'streaming' | 'polling';

export interface ExecutionMonitorHandlers {
  onProgress(progress: ExecutionProgress): void;
  onSnapshot(detail: ExecutionDetail): void;
  onMode(mode: ExecutionMonitorMode): void;
  onError(error: unknown): void;
}

export interface ExecutionMonitor {
  close(): void;
}

export type MonitorExecutionUseCase = ReturnType<typeof createMonitorExecutionUseCase>;

export const createMonitorExecutionUseCase =
  (
    repository: ExecutionRepository,
    progressService: ExecutionProgressService,
    scheduler: SchedulerService,
  ) =>
  (id: string, handlers: ExecutionMonitorHandlers): ExecutionMonitor => {
    let disposed = false;
    let settled = false;
    let refreshing = false;
    let mode: ExecutionMonitorMode = 'idle';
    let subscription: ExecutionProgressSubscription | undefined;
    let poller: ScheduledTask | undefined;

    const notifyMode = (nextMode: ExecutionMonitorMode) => {
      if (mode === nextMode) {
        return;
      }
      mode = nextMode;
      handlers.onMode(nextMode);
    };

    const closeSubscription = () => {
      const current = subscription;
      subscription = undefined;
      current?.close();
    };

    const closePoller = () => {
      const current = poller;
      poller = undefined;
      current?.cancel();
    };

    const closeResources = () => {
      closeSubscription();
      closePoller();
    };

    const stop = () => {
      settled = true;
      closeResources();
      if (!disposed) {
        notifyMode('idle');
      }
    };

    const refresh = async () => {
      if (disposed || settled || refreshing) {
        return;
      }

      refreshing = true;
      try {
        const snapshot = await repository.get(id);
        if (disposed || settled) {
          return;
        }
        handlers.onSnapshot(snapshot);
        if (disposed || settled) {
          return;
        }
        if (isTerminalExecution(snapshot.status)) {
          stop();
        }
      } catch (error) {
        if (!disposed && !settled) {
          handlers.onError(error);
          if (!disposed && !settled) {
            stop();
          }
        }
      } finally {
        refreshing = false;
      }
    };

    const startPolling = () => {
      if (disposed || settled || mode === 'polling') {
        return;
      }
      closeSubscription();
      if (disposed || settled) {
        return;
      }
      notifyMode('polling');
      if (disposed || settled) {
        return;
      }
      const candidate = scheduler.every(POLL_INTERVAL_MS, () => void refresh());
      if (disposed || settled) {
        candidate.cancel();
        return;
      }
      poller = candidate;
      void refresh();
    };

    const finalizeFromStream = async () => {
      if (disposed) {
        return;
      }
      try {
        const snapshot = await repository.get(id);
        if (!disposed) {
          handlers.onSnapshot(snapshot);
        }
      } catch {
        // The terminal progress event already contains the status required by
        // the UI. Preserve that useful update when the final detail refetch
        // itself is unavailable.
      } finally {
        if (!disposed) {
          notifyMode('idle');
        }
      }
    };

    notifyMode('streaming');
    let failedBeforeSubscriptionRegistered = false;
    try {
      const candidate = progressService.subscribe(id, {
        onProgress: (progress) => {
          if (disposed || settled) {
            return;
          }
          handlers.onProgress(progress);
          if (disposed || settled) {
            return;
          }
          if (isTerminalExecution(progress.status)) {
            settled = true;
            closeResources();
            if (!disposed) {
              void finalizeFromStream();
            }
          }
        },
        onError: () => {
          if (subscription === undefined) {
            failedBeforeSubscriptionRegistered = true;
          }
          startPolling();
        },
      });

      if (disposed || settled || failedBeforeSubscriptionRegistered) {
        candidate.close();
      } else {
        subscription = candidate;
      }
    } catch {
      startPolling();
    }

    return {
      close: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        settled = true;
        closeResources();
        notifyMode('idle');
      },
    };
  };

import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type {
  QueryProgressService,
  QueryProgressSubscription,
} from '@/src/application/services/query-progress.service.interface';
import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import {
  isTerminalStatus,
  type SqlExecutionEvent,
  type SqlExecutionResult,
} from '@/src/entities/models/query';

const POLL_INTERVAL_MS = 1500;

export type QueryMonitorChannel = 'streaming' | 'polling';

export interface QueryMonitorHandlers {
  onSnapshot(result: SqlExecutionResult): void;
  onProgress?(event: SqlExecutionEvent): void;
  onChannel?(channel: QueryMonitorChannel): void;
  onError(error: unknown): void;
}

export interface QueryMonitor {
  close(): void;
}

export type MonitorQueryUseCase = ReturnType<typeof createMonitorQueryUseCase>;

export const createMonitorQueryUseCase =
  (
    repository: QueryRepository,
    progressService: QueryProgressService,
    scheduler: SchedulerService,
  ) =>
  (id: string, handlers: QueryMonitorHandlers): QueryMonitor => {
    let disposed = false;
    let settled = false;
    let refreshing = false;
    let refreshQueued = false;
    let channel: QueryMonitorChannel = 'streaming';
    let subscription: QueryProgressSubscription | undefined;
    let poller: ScheduledTask | undefined;

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

    const stop = () => {
      settled = true;
      refreshQueued = false;
      closeSubscription();
      closePoller();
    };

    const refresh = async (): Promise<void> => {
      if (disposed || settled) {
        return;
      }
      if (refreshing) {
        refreshQueued = true;
        return;
      }

      refreshing = true;
      try {
        const result = await repository.get(id);
        if (disposed || settled) {
          return;
        }
        handlers.onSnapshot(result);
        if (disposed || settled) {
          return;
        }
        if (isTerminalStatus(result.status)) {
          stop();
        }
      } catch (error) {
        if (!disposed && !settled) {
          handlers.onError(error);
        }
      } finally {
        refreshing = false;
        if (refreshQueued && !disposed && !settled) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    const startPolling = () => {
      if (disposed || settled || channel === 'polling') {
        return;
      }

      channel = 'polling';
      closeSubscription();
      if (disposed || settled) {
        return;
      }
      handlers.onChannel?.('polling');
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

    void refresh();
    handlers.onChannel?.('streaming');

    if (!disposed && !settled) {
      let failedBeforeSubscriptionRegistered = false;
      try {
        const candidate = progressService.subscribe(id, {
          onEvent: (event) => {
            if (disposed || settled) {
              return;
            }
            handlers.onProgress?.(event);
            if (!disposed && !settled) {
              void refresh();
            }
          },
          onError: () => {
            if (disposed || settled) {
              return;
            }
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
    }

    return {
      close: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        stop();
      },
    };
  };

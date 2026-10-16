import type {
  MonitorQueryUseCase,
  QueryMonitor,
  QueryMonitorChannel,
  QueryMonitorHandlers,
} from '@/src/application/use-cases/queries/monitor-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentQueryEvent,
  presentQueryResult,
  type SqlExecutionEventViewModel,
  type SqlExecutionResultViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

import { queryIdSchema } from './query.schemas';

export interface QueryMonitorControllerHandlers {
  onSnapshot(result: SqlExecutionResultViewModel): void;
  onProgress?(event: SqlExecutionEventViewModel): void;
  onChannel?(channel: QueryMonitorChannel): void;
  onError(error: unknown): void;
}

export type MonitorQueryController = ReturnType<typeof createMonitorQueryController>;

export const createMonitorQueryController =
  (useCase: MonitorQueryUseCase) =>
  (id: string, handlers: QueryMonitorControllerHandlers): QueryMonitor => {
    const parsed = queryIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid query identifier', { cause: parsed.error });
    }
    const applicationHandlers: QueryMonitorHandlers = {
      onSnapshot: (result) => handlers.onSnapshot(presentQueryResult(result)),
      onError: handlers.onError,
      ...(handlers.onProgress
        ? { onProgress: (event) => handlers.onProgress?.(presentQueryEvent(event)) }
        : {}),
      ...(handlers.onChannel ? { onChannel: handlers.onChannel } : {}),
    };
    return useCase(parsed.data, applicationHandlers);
  };

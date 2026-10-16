import type {
  ExecutionMonitor,
  ExecutionMonitorHandlers,
  ExecutionMonitorMode,
  MonitorExecutionUseCase,
} from '@/src/application/use-cases/executions/monitor-execution.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentExecutionDetail,
  presentExecutionProgress,
  type ExecutionDetailViewModel,
  type ExecutionProgressViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

import { executionIdSchema } from './execution.schemas';

export interface ExecutionMonitorControllerHandlers {
  onProgress(progress: ExecutionProgressViewModel): void;
  onSnapshot(detail: ExecutionDetailViewModel): void;
  onMode(mode: ExecutionMonitorMode): void;
  onError(error: unknown): void;
}

export type MonitorExecutionController = ReturnType<typeof createMonitorExecutionController>;

export const createMonitorExecutionController =
  (useCase: MonitorExecutionUseCase) =>
  (id: string, handlers: ExecutionMonitorControllerHandlers): ExecutionMonitor => {
    const parsed = executionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid execution identifier', { cause: parsed.error });
    }

    const applicationHandlers: ExecutionMonitorHandlers = {
      onProgress: (progress) => handlers.onProgress(presentExecutionProgress(progress)),
      onSnapshot: (detail) => handlers.onSnapshot(presentExecutionDetail(detail)),
      onMode: handlers.onMode,
      onError: handlers.onError,
    };
    return useCase(parsed.data, applicationHandlers);
  };

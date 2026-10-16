import type {
  TablePreviewMonitor,
  TablePreviewMonitorHandlers,
  MonitorTablePreviewUseCase,
} from '@/src/application/use-cases/catalog/monitor-table-preview.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TablePreviewRequest } from '@/src/entities/models/catalog';
import {
  presentTablePreview,
  type TablePreviewViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { tablePreviewRequestSchema } from './catalog.schemas';

export interface TablePreviewMonitorControllerHandlers {
  onSnapshot(preview: TablePreviewViewModel): void;
  onError(error: unknown): void;
}

export type MonitorTablePreviewController = ReturnType<typeof createMonitorTablePreviewController>;

export const createMonitorTablePreviewController =
  (useCase: MonitorTablePreviewUseCase) =>
  (
    request: TablePreviewRequest,
    handlers: TablePreviewMonitorControllerHandlers,
  ): TablePreviewMonitor => {
    const parsed = tablePreviewRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new InputParseError('Invalid table preview request', { cause: parsed.error });
    }
    const applicationHandlers: TablePreviewMonitorHandlers = {
      onSnapshot: (preview) => handlers.onSnapshot(presentTablePreview(preview)),
      onError: handlers.onError,
    };
    return useCase(parsed.data, applicationHandlers);
  };

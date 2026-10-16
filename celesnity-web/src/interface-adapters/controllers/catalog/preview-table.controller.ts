import type { PreviewTableUseCase } from '@/src/application/use-cases/catalog/preview-table.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TablePreviewRequest } from '@/src/entities/models/catalog';
import {
  presentTablePreview,
  type TablePreviewViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { tablePreviewRequestSchema } from './catalog.schemas';

export type PreviewTableController = ReturnType<typeof createPreviewTableController>;

export const createPreviewTableController =
  (
    useCase: PreviewTableUseCase,
  ): ((request: TablePreviewRequest) => Promise<TablePreviewViewModel>) =>
  async (request) => {
    const parsed = tablePreviewRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new InputParseError('Invalid table reference', { cause: parsed.error });
    }
    return presentTablePreview(await useCase(parsed.data));
  };

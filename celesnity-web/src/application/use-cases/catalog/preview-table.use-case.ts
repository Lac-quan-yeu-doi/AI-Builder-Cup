import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { TablePreviewRequest } from '@/src/entities/models/catalog';

export type PreviewTableUseCase = ReturnType<typeof createPreviewTableUseCase>;

export const createPreviewTableUseCase =
  (repository: CatalogRepository) => (request: TablePreviewRequest) =>
    repository.previewTable(request);

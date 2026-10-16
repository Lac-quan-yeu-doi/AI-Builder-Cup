import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { TableRef } from '@/src/entities/models/catalog';

export type LoadTableMetadataUseCase = ReturnType<typeof createLoadTableMetadataUseCase>;

export const createLoadTableMetadataUseCase = (repository: CatalogRepository) => (ref: TableRef) =>
  repository.getTableMetadata(ref);

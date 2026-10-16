import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { TableRef } from '@/src/entities/models/catalog';

export type ListTableSnapshotsUseCase = ReturnType<typeof createListTableSnapshotsUseCase>;

export const createListTableSnapshotsUseCase = (repository: CatalogRepository) => (ref: TableRef) =>
  repository.listSnapshots(ref);

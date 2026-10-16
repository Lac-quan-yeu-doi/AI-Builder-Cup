import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';

export type CreateNamespaceUseCase = ReturnType<typeof createCreateNamespaceUseCase>;

export const createCreateNamespaceUseCase =
  (repository: CatalogRepository) => (catalog: string, name: string, description?: string) =>
    repository.createNamespace(catalog, name, description);

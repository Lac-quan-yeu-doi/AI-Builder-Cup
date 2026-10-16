import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';

export type UpdateNamespaceDescriptionUseCase = ReturnType<
  typeof createUpdateNamespaceDescriptionUseCase
>;

export const createUpdateNamespaceDescriptionUseCase =
  (repository: CatalogRepository) => (catalog: string, name: string, description?: string) =>
    repository.updateNamespaceDescription(catalog, name, description);

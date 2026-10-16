import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { CatalogNamespaceScope } from '@/src/entities/models/catalog';

export type ListNamespacesUseCase = ReturnType<typeof createListNamespacesUseCase>;

export const createListNamespacesUseCase =
  (repository: CatalogRepository) =>
  (catalog: string, scope: CatalogNamespaceScope = 'writable') =>
    repository.listNamespaces(catalog, scope);

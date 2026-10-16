import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';

export type ListQueryNamespacesUseCase = ReturnType<typeof createListQueryNamespacesUseCase>;

export const createListQueryNamespacesUseCase =
  (repository: QueryRepository) => (catalog: string) =>
    repository.listNamespaces(catalog);

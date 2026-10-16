import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';

export type ListQueryCatalogsUseCase = ReturnType<typeof createListQueryCatalogsUseCase>;

export const createListQueryCatalogsUseCase = (repository: QueryRepository) => () =>
  repository.listCatalogs();

import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';

export type ListCatalogsUseCase = ReturnType<typeof createListCatalogsUseCase>;

export const createListCatalogsUseCase = (repository: CatalogRepository) => () =>
  repository.listCatalogs();

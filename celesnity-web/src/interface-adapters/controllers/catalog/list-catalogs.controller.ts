import type { ListCatalogsUseCase } from '@/src/application/use-cases/catalog/list-catalogs.use-case';
import {
  presentCatalogs,
  type CatalogViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

export type ListCatalogsController = ReturnType<typeof createListCatalogsController>;

export const createListCatalogsController =
  (useCase: ListCatalogsUseCase): (() => Promise<readonly CatalogViewModel[]>) =>
  async () =>
    presentCatalogs(await useCase());

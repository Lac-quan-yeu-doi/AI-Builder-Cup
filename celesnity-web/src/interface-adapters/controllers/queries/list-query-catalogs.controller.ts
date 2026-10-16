import type { ListQueryCatalogsUseCase } from '@/src/application/use-cases/queries/list-query-catalogs.use-case';
import {
  presentQueryCatalogs,
  type SqlCatalogViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

export type ListQueryCatalogsController = ReturnType<typeof createListQueryCatalogsController>;

export const createListQueryCatalogsController =
  (useCase: ListQueryCatalogsUseCase): (() => Promise<readonly SqlCatalogViewModel[]>) =>
  async () =>
    presentQueryCatalogs(await useCase());

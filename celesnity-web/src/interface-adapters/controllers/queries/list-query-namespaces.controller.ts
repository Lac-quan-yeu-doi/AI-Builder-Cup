import type { ListQueryNamespacesUseCase } from '@/src/application/use-cases/queries/list-query-namespaces.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentQueryNamespaces,
  type SqlNamespaceViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

import { queryCatalogSchema } from './query.schemas';

export type ListQueryNamespacesController = ReturnType<typeof createListQueryNamespacesController>;

export const createListQueryNamespacesController =
  (
    useCase: ListQueryNamespacesUseCase,
  ): ((catalog: string) => Promise<readonly SqlNamespaceViewModel[]>) =>
  async (catalog) => {
    const parsed = queryCatalogSchema.safeParse(catalog);
    if (!parsed.success) {
      throw new InputParseError('Invalid query catalog', { cause: parsed.error });
    }
    return presentQueryNamespaces(await useCase(parsed.data));
  };

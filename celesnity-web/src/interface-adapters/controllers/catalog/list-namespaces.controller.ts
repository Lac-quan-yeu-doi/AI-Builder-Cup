import type { ListNamespacesUseCase } from '@/src/application/use-cases/catalog/list-namespaces.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CatalogNamespaceScope } from '@/src/entities/models/catalog';
import {
  presentNamespaces,
  type NamespaceViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { catalogNameSchema, catalogNamespaceScopeSchema } from './catalog.schemas';

export type ListNamespacesController = ReturnType<typeof createListNamespacesController>;

export const createListNamespacesController =
  (
    useCase: ListNamespacesUseCase,
  ): ((catalog: string, scope?: CatalogNamespaceScope) => Promise<readonly NamespaceViewModel[]>) =>
  async (catalog, scope = 'writable') => {
    const parsedCatalog = catalogNameSchema.safeParse(catalog);
    const parsedScope = catalogNamespaceScopeSchema.safeParse(scope);
    if (!parsedCatalog.success || !parsedScope.success) {
      throw new InputParseError('Invalid catalog namespace request', {
        cause: parsedCatalog.success ? parsedScope.error : parsedCatalog.error,
      });
    }
    return presentNamespaces(await useCase(parsedCatalog.data, parsedScope.data));
  };

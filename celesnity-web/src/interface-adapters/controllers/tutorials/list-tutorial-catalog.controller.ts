import type { ListTutorialCatalogUseCase } from '@/src/application/use-cases/tutorials/list-tutorial-catalog.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentTutorialCatalog,
  type CatalogViewModel,
} from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';

import { listTutorialCatalogInputSchema, type ListTutorialCatalogInput } from './tutorial.schemas';

export type ListTutorialCatalogController = ReturnType<typeof createListTutorialCatalogController>;

export const createListTutorialCatalogController =
  (
    useCase: ListTutorialCatalogUseCase,
  ): ((input: ListTutorialCatalogInput) => Promise<CatalogViewModel>) =>
  async (input) => {
    const parsed = listTutorialCatalogInputSchema.safeParse(input);

    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial catalog input', { cause: parsed.error });
    }

    return presentTutorialCatalog(await useCase(parsed.data));
  };

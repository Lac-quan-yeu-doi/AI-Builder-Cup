import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ListActionCatalogUseCase } from '@/src/application/use-cases/action-catalog/list-action-catalog.use-case';
import {
  presentActionCatalogEntry,
  type ActionCatalogEntryViewModel,
} from '@/src/interface-adapters/presenters/action-catalog.presenter';

import { listActionCatalogInputSchema } from './action-catalog.schemas';

export type ListActionCatalogController = (
  domain: unknown,
) => Promise<readonly ActionCatalogEntryViewModel[]>;

export const createListActionCatalogController =
  (useCase: ListActionCatalogUseCase): ListActionCatalogController =>
  async (domain: unknown): Promise<readonly ActionCatalogEntryViewModel[]> => {
    const parsed = listActionCatalogInputSchema.safeParse(domain);
    if (!parsed.success)
      throw new InputParseError('Invalid action-catalog domain', { cause: parsed.error });
    const entries = await useCase(parsed.data);
    return entries.map(presentActionCatalogEntry);
  };

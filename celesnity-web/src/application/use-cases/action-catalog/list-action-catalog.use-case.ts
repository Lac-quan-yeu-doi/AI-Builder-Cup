import type { ActionCatalogRepository } from '@/src/application/repositories/action-catalog.repository.interface';
import type { ActionCatalogDomain, ActionCatalogEntry } from '@/src/entities/models/action-catalog';

export type ListActionCatalogUseCase = (
  domain: ActionCatalogDomain,
) => Promise<readonly ActionCatalogEntry[]>;

export const createListActionCatalogUseCase =
  (repository: ActionCatalogRepository): ListActionCatalogUseCase =>
  (domain: ActionCatalogDomain): Promise<readonly ActionCatalogEntry[]> => {
    return repository.list(domain);
  };

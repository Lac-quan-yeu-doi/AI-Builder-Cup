import type { ActionCatalogDomain, ActionCatalogEntry } from '@/src/entities/models/action-catalog';

export interface ActionCatalogRepository {
  list(domain: ActionCatalogDomain): Promise<readonly ActionCatalogEntry[]>;
}

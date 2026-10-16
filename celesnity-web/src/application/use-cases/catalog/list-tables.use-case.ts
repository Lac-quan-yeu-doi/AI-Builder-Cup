import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';

export type ListTablesUseCase = ReturnType<typeof createListTablesUseCase>;

export const createListTablesUseCase =
  (repository: CatalogRepository) => (catalog: string, schema: string) =>
    repository.listTables(catalog, schema);

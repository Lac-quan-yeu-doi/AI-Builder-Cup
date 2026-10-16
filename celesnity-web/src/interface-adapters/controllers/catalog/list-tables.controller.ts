import type { ListTablesUseCase } from '@/src/application/use-cases/catalog/list-tables.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentTableSummaries,
  type TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { listTablesInputSchema } from './catalog.schemas';

export type ListTablesController = ReturnType<typeof createListTablesController>;

export const createListTablesController =
  (
    useCase: ListTablesUseCase,
  ): ((catalog: string, schema: string) => Promise<readonly TableSummaryViewModel[]>) =>
  async (catalog, schema) => {
    const parsed = listTablesInputSchema.safeParse({ catalog, schema });
    if (!parsed.success) {
      throw new InputParseError('Invalid table list input', { cause: parsed.error });
    }
    return presentTableSummaries(await useCase(parsed.data.catalog, parsed.data.schema));
  };

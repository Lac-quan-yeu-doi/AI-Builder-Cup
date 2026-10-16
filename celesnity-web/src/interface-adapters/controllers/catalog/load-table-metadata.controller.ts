import type { LoadTableMetadataUseCase } from '@/src/application/use-cases/catalog/load-table-metadata.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TableRef } from '@/src/entities/models/catalog';
import {
  presentTableMetadata,
  type TableMetadataViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { tableRefSchema } from './catalog.schemas';

export type LoadTableMetadataController = ReturnType<typeof createLoadTableMetadataController>;

export const createLoadTableMetadataController =
  (useCase: LoadTableMetadataUseCase): ((ref: TableRef) => Promise<TableMetadataViewModel>) =>
  async (ref) => {
    const parsed = tableRefSchema.safeParse(ref);
    if (!parsed.success) {
      throw new InputParseError('Invalid table reference', { cause: parsed.error });
    }
    return presentTableMetadata(await useCase(parsed.data));
  };

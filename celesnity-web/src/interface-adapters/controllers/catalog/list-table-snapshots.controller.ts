import type { ListTableSnapshotsUseCase } from '@/src/application/use-cases/catalog/list-table-snapshots.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TableRef } from '@/src/entities/models/catalog';
import {
  presentTableSnapshots,
  type TableSnapshotViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

import { tableRefSchema } from './catalog.schemas';

export type ListTableSnapshotsController = ReturnType<typeof createListTableSnapshotsController>;

export const createListTableSnapshotsController =
  (
    useCase: ListTableSnapshotsUseCase,
  ): ((ref: TableRef) => Promise<readonly TableSnapshotViewModel[]>) =>
  async (ref) => {
    const parsed = tableRefSchema.safeParse(ref);
    if (!parsed.success) {
      throw new InputParseError('Invalid table reference', { cause: parsed.error });
    }
    return presentTableSnapshots(await useCase(parsed.data));
  };

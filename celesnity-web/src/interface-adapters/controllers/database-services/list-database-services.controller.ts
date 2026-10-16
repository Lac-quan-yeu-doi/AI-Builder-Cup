import type { ListDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-database-services.use-case';
import {
  presentDatabaseServicePage,
  type DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';
import type { DatabaseServiceListQuery } from '@/src/entities/models/database-service';

export type ListDatabaseServicesController = ReturnType<
  typeof createListDatabaseServicesController
>;

export const createListDatabaseServicesController =
  (useCase: ListDatabaseServicesUseCase) =>
  async (
    query?: DatabaseServiceListQuery,
  ): Promise<{
    readonly items: readonly DatabaseServiceViewModel[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  }> =>
    presentDatabaseServicePage(await useCase(query));

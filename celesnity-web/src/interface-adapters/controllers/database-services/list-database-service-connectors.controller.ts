import type { ListDatabaseServiceConnectorsUseCase } from '@/src/application/use-cases/database-services/list-database-service-connectors.use-case';
import type { DatabaseServiceConnectorDescriptor } from '@/src/entities/models/database-service';

export type ListDatabaseServiceConnectorsController = ReturnType<
  typeof createListDatabaseServiceConnectorsController
>;

export const createListDatabaseServiceConnectorsController =
  (useCase: ListDatabaseServiceConnectorsUseCase) =>
  (): Promise<readonly DatabaseServiceConnectorDescriptor[]> =>
    useCase();

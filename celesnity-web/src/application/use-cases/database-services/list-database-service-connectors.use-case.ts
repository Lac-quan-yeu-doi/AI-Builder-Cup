import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type ListDatabaseServiceConnectorsUseCase = ReturnType<
  typeof createListDatabaseServiceConnectorsUseCase
>;

export const createListDatabaseServiceConnectorsUseCase =
  (repository: DatabaseServiceRepository) => () =>
    repository.listConnectorDescriptors();

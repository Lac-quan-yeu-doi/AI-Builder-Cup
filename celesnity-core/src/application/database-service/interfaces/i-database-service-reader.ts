import type {
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';

export interface IDatabaseServiceReader {
  listActive(query: DatabaseServiceListQuery): Promise<DatabaseServiceListPage>;
  findActiveById(id: string): Promise<DatabaseServiceView | undefined>;
}

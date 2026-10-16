export interface IDatabaseServiceMembershipRepository {
  listDatabaseNames(databaseServiceId: string): Promise<readonly string[]>;
  listDatabaseServiceIds(databaseName: string): Promise<readonly string[]>;
  exists(databaseServiceId: string, databaseName: string): Promise<boolean>;
  hasAny(databaseServiceId: string): Promise<boolean>;
  lockExisting(databaseServiceId: string, databaseName: string): Promise<boolean>;
  attach(databaseServiceId: string, databaseName: string, createdAt: Date): Promise<void>;
  detach(databaseServiceId: string, databaseName: string): Promise<void>;
}

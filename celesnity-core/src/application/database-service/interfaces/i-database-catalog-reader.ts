export interface IDatabaseCatalogReader {
  exists(databaseName: string): Promise<boolean>;
}

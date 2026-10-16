export interface CatalogSourceBinding {
  readonly databaseServiceId: string;
  readonly namespaceId: string;
  readonly relationId: string;
  readonly schemaName: string;
  readonly tableName: string;
  readonly columns: readonly CatalogSourceColumn[];
}

export interface CatalogSourceColumn {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
}

export interface ICatalogSourceBindingResolver {
  resolve(
    databaseServiceId: string,
    namespaceId: string,
    relationId: string,
  ): Promise<CatalogSourceBinding | undefined>;
}

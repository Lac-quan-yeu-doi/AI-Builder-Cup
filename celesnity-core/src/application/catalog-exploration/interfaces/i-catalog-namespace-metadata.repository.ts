export interface ICatalogNamespaceMetadataRepository {
  listDescriptions(
    catalog: string,
    namespaces: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;

  setDescription(
    catalog: string,
    namespace: string,
    description: string | undefined,
  ): Promise<void>;
}

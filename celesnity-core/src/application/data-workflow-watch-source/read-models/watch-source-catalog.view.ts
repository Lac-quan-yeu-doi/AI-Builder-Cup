export interface WatchSourceCatalogQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
}

export interface WatchSourceCatalogServiceView {
  readonly id: string;
  readonly name: string;
  /** Catalog memberships are labels for Celesnity targets, not source DB names. */
  readonly databaseNames: readonly string[];
  readonly connectorType: string;
  readonly verificationStatus: 'SUCCEEDED';
  readonly metadataAvailable: boolean;
}

export interface WatchSourceCatalogRelationColumnView {
  readonly name: string;
  readonly nativeType: string;
  readonly nullable: boolean;
}

export interface WatchSourceCatalogRelationView {
  readonly schema: string;
  readonly table: string;
  readonly relationType: string;
  readonly columns: readonly WatchSourceCatalogRelationColumnView[];
}

export interface WatchSourceCatalogPage<T> {
  readonly data: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

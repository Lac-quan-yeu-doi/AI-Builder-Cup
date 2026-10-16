export type SourceMetadataSortDirection = 'asc' | 'desc';
export type SourceNamespaceSort = 'name' | 'relationCount' | 'lastCrawledAt';
export type SourceRelationSort = 'name' | 'relationType' | 'columnCount' | 'lastCrawledAt';
export type SourceColumnSort = 'ordinalPosition' | 'name' | 'nativeType' | 'nullable';

export interface SourceMetadataPageRequest<TSort extends string> {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly sortBy: TSort;
  readonly sortDirection: SourceMetadataSortDirection;
}

export interface SourceMetadataPage<T> {
  readonly items: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly sort: {
    readonly field: string;
    readonly direction: SourceMetadataSortDirection;
  };
}

export interface SourceMetadataSnapshotSummary {
  readonly hasSnapshot: boolean;
  readonly databaseCount: number;
  readonly schemaCount: number;
  readonly relationCount: number;
  readonly columnCount: number;
  readonly constraintCount: number;
  readonly lastCrawledAt?: string;
}

export interface SourceNamespaceView {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly relationCount: number;
  readonly lastCrawledAt?: string;
}

export interface SourceRelationView {
  readonly id: string;
  readonly namespaceId: string;
  readonly name: string;
  readonly relationType: string;
  readonly description?: string;
  readonly columnCount: number;
  readonly ddl?: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly lastCrawledAt?: string;
}

export interface SourceColumnView {
  readonly id: string;
  readonly relationId: string;
  readonly name: string;
  readonly ordinalPosition: number;
  readonly nativeType: string;
  readonly canonicalType: string;
  readonly nullable: boolean;
  readonly defaultValue?: string;
  readonly description?: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface SourceConstraintColumnView {
  readonly name: string;
  readonly position: number;
  readonly referencedColumnName?: string;
}

export interface SourceConstraintView {
  readonly id: string;
  readonly name: string;
  readonly constraintType: string;
  readonly columns: readonly SourceConstraintColumnView[];
  readonly referencedRelationPath?: string;
  readonly checkExpression?: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

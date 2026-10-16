import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';

export type MetadataJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly MetadataJsonValue[]
  | { readonly [key: string]: MetadataJsonValue };

export interface DiscoveredNamespace {
  readonly type: 'DATABASE' | 'SCHEMA';
  readonly name: string;
  readonly canonicalPath: string;
  readonly nativeIdentifier: string;
  readonly deletionScopeKey: string;
  readonly parentCanonicalPath?: string;
  readonly description?: string;
  readonly properties: Readonly<Record<string, MetadataJsonValue>>;
}

export interface DiscoveredRelation {
  readonly namespaceCanonicalPath: string;
  /** Namespace level is needed when a DBMS maps a database directly to relations. */
  readonly namespaceType?: 'DATABASE' | 'SCHEMA';
  readonly name: string;
  readonly type: 'TABLE' | 'PARTITIONED_TABLE' | 'VIEW' | 'MATERIALIZED_VIEW' | 'FOREIGN_TABLE';
  readonly canonicalPath: string;
  readonly nativeIdentifier: string;
  readonly deletionScopeKey: string;
  readonly description?: string;
  readonly properties: Readonly<Record<string, MetadataJsonValue>>;
}

export interface DiscoveredColumn {
  readonly name: string;
  readonly ordinalPosition: number;
  readonly nativeType: string;
  readonly canonicalType: string;
  readonly nullable: boolean;
  readonly defaultValue?: string;
  readonly description?: string;
  readonly properties: Readonly<Record<string, MetadataJsonValue>>;
}

export interface DiscoveredConstraint {
  readonly name: string;
  readonly type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK';
  readonly columns: readonly string[];
  readonly referencedRelationPath?: string;
  readonly referencedColumns?: readonly string[];
  readonly checkExpression?: string;
  readonly properties: Readonly<Record<string, MetadataJsonValue>>;
}

export interface RelationMetadata {
  readonly relation: DiscoveredRelation;
  readonly ddl?: string;
  readonly columns: readonly DiscoveredColumn[];
  readonly constraints: readonly DiscoveredConstraint[];
}

export interface DatabaseDiscoveryConfig extends Readonly<Record<string, MetadataJsonValue>> {
  readonly includeViews: boolean;
  readonly includeMaterializedViews: boolean;
  readonly includeDdl: boolean;
  readonly databaseIncludes: readonly string[];
  readonly databaseExcludes: readonly string[];
  readonly schemaIncludes: readonly string[];
  readonly schemaExcludes: readonly string[];
  readonly relationIncludes: readonly string[];
  readonly relationExcludes: readonly string[];
}

export interface DatabaseMetadataCapabilities {
  readonly descriptions: boolean;
  readonly materializedViews: boolean;
  readonly ddl: boolean;
}

export interface SanitizedMetadataCrawlerLogger {
  info(event: string, context?: Readonly<Record<string, string | number | boolean>>): void;
  warn(event: string, context?: Readonly<Record<string, string | number | boolean>>): void;
}

export interface DatabaseMetadataSourceInput {
  readonly profile: DatabaseServiceRuntimeProfile;
  readonly discovery: DatabaseDiscoveryConfig;
  readonly deadline: Date;
  readonly signal: AbortSignal;
  readonly logger: SanitizedMetadataCrawlerLogger;
}

export interface DatabaseMetadataSource {
  listNamespaces(): AsyncIterable<DiscoveredNamespace>;
  listRelations(scope: DiscoveredNamespace): AsyncIterable<DiscoveredRelation>;
  describeRelation(relation: DiscoveredRelation): Promise<RelationMetadata>;
  close(): Promise<void>;
}

export interface DatabaseMetadataSourceFactory {
  readonly connectorType: string;
  readonly capabilities: DatabaseMetadataCapabilities;
  create(input: DatabaseMetadataSourceInput): Promise<DatabaseMetadataSource>;
}

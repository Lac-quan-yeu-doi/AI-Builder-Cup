import type {
  DiscoveredNamespace,
  RelationMetadata,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';

export interface MetadataDiscoveryCounts {
  readonly databaseCount: number;
  readonly schemaCount: number;
  readonly relationCount: number;
  readonly columnCount: number;
}

export interface MetadataChangeCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly deleted: number;
}

export interface MetadataCatalogWriteResult {
  readonly discovered: MetadataDiscoveryCounts;
  readonly changes: MetadataChangeCounts;
}

export interface MetadataScopeCounts {
  readonly discoveredCount: number;
  readonly relationCount: number;
  readonly columnCount: number;
}

export type SanitizedCrawlerFailureCategory =
  | 'CONFIGURATION'
  | 'AUTHENTICATION'
  | 'NETWORK'
  | 'PERMISSION'
  | 'DISCOVERY'
  | 'PERSISTENCE'
  | 'TIMEOUT'
  | 'INTERNAL';

export interface SanitizedCrawlerFailure {
  readonly category: SanitizedCrawlerFailureCategory;
  readonly summary: string;
}

export interface IMetadataCatalogWriter {
  beginScope(runId: string, scope: DiscoveredNamespace, now: Date): Promise<void>;
  upsertRelationGraph(
    input: RelationMetadata,
    runId: string,
    now: Date,
  ): Promise<MetadataCatalogWriteResult>;
  completeScope(
    runId: string,
    scopeKey: string,
    counts: MetadataScopeCounts,
    now: Date,
  ): Promise<MetadataChangeCounts>;
  failScope(
    runId: string,
    scopeKey: string,
    counts: MetadataScopeCounts,
    failure: SanitizedCrawlerFailure,
    now: Date,
  ): Promise<void>;
}

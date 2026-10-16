import type { DatabaseMetadataSourceFactory } from '@application/metadata-crawler/interfaces/i-database-metadata-source';

export interface IDatabaseMetadataSourceRegistry {
  require(connectorType: string): DatabaseMetadataSourceFactory;
  list(): readonly DatabaseMetadataSourceFactory[];
}

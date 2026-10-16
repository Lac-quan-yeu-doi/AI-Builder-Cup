import type { DatabaseMetadataSourceFactory } from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';

/** Startup-owned registry for metadata crawler DBMS source factories. */
export class DatabaseMetadataSourceRegistry implements IDatabaseMetadataSourceRegistry {
  private readonly factories: ReadonlyMap<string, DatabaseMetadataSourceFactory>;

  public constructor(factories: readonly DatabaseMetadataSourceFactory[]) {
    const entries = new Map<string, DatabaseMetadataSourceFactory>();
    for (const factory of factories) {
      const connectorType = normalize(factory.connectorType);
      if (entries.has(connectorType)) {
        throw new Error(`Metadata source ${connectorType} is registered more than once.`);
      }
      entries.set(connectorType, factory);
    }
    this.factories = entries;
  }

  public require(connectorType: string): DatabaseMetadataSourceFactory {
    const normalized = normalize(connectorType);
    const factory = this.factories.get(normalized);
    if (factory === undefined) {
      throw MetadataCrawlerError.unsupportedConnector(normalized);
    }
    return factory;
  }

  public list(): readonly DatabaseMetadataSourceFactory[] {
    return [...this.factories.values()].sort((left, right) =>
      normalize(left.connectorType).localeCompare(normalize(right.connectorType)),
    );
  }
}

function normalize(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new Error('Metadata source connector type is required.');
  }
  return normalized;
}

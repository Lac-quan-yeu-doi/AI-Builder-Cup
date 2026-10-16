/** Dependency-injection tokens for the Metadata Crawler bounded context. */
export const METADATA_CRAWLER_REPOSITORY = Symbol('IMetadataCrawlerRepository');
export const METADATA_CRAWLER_READER = Symbol('IMetadataCrawlerReader');
export const METADATA_CRAWLER_RUN_QUEUE = Symbol('IMetadataCrawlerRunQueue');
export const METADATA_CRAWLER_RUN_REPOSITORY = Symbol('IMetadataCrawlerRunRepository');
export const METADATA_CRAWLER_SCHEDULER_STORE = Symbol('IMetadataCrawlerSchedulerStore');
export const METADATA_CRAWLER_SCHEDULE = Symbol('IMetadataCrawlerSchedule');
export const METADATA_CRAWLER_LOG_STORE = Symbol('IMetadataCrawlerLogStore');
export const DATABASE_METADATA_SOURCE_REGISTRY = Symbol('IDatabaseMetadataSourceRegistry');
export const METADATA_CRAWLER_TELEMETRY = Symbol('IMetadataCrawlerTelemetry');
export const SOURCE_METADATA_CATALOG_READER = Symbol('ISourceMetadataCatalogReader');

import type { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';

export interface IMetadataCrawlerRepository {
  create(crawler: MetadataCrawler): Promise<void>;
  update(crawler: MetadataCrawler, expectedUpdatedAt: Date): Promise<boolean>;
  findById(id: string): Promise<MetadataCrawler | undefined>;
  findByDatabaseServiceId(databaseServiceId: string): Promise<MetadataCrawler | undefined>;
}

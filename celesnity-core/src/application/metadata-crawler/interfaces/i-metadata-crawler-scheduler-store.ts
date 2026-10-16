import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';

export interface IMetadataCrawlerSchedulerStore {
  scheduleDue(limit: number, now: Date): Promise<readonly MetadataCrawlerRun[]>;
}

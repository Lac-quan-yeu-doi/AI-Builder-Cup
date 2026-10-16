import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type { MetadataCrawlerRunStatusValue } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export interface IMetadataCrawlerRunRepository {
  update(run: MetadataCrawlerRun, expectedStatus: MetadataCrawlerRunStatusValue): Promise<boolean>;
}

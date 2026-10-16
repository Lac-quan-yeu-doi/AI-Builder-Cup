import type {
  MetadataCrawlerRunView,
  MetadataCrawlerView,
} from '@application/metadata-crawler/read-models/metadata-crawler.view';

export interface IMetadataCrawlerReader {
  list(includeArchived?: boolean): Promise<readonly MetadataCrawlerView[]>;
  findById(id: string): Promise<MetadataCrawlerView | undefined>;
  listRuns(crawlerId: string, limit?: number): Promise<readonly MetadataCrawlerRunView[]>;
  findRunById(runId: string): Promise<MetadataCrawlerRunView | undefined>;
}

import type {
  AssignMetadataCrawlerInput,
  MetadataCrawler,
  MetadataCrawlerAssignableService,
  MetadataCrawlerListPage,
  MetadataCrawlerLog,
  MetadataCrawlerRun,
  UpdateMetadataCrawlerInput,
} from '@/src/entities/models/metadata-crawler';

export interface MetadataCrawlerRepository {
  list(includeArchived?: boolean): Promise<MetadataCrawlerListPage>;
  get(id: string): Promise<MetadataCrawler>;
  listAssignableDatabaseServices(): Promise<readonly MetadataCrawlerAssignableService[]>;
  assign(input: AssignMetadataCrawlerInput): Promise<MetadataCrawler>;
  update(id: string, input: UpdateMetadataCrawlerInput): Promise<MetadataCrawler>;
  archive(id: string): Promise<void>;
  runNow(id: string): Promise<MetadataCrawlerRun>;
  listRuns(id: string, limit?: number): Promise<readonly MetadataCrawlerRun[]>;
  getRunLogs(runId: string): Promise<MetadataCrawlerLog>;
}

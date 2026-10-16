import type { MetadataCrawlerRepository } from '@/src/application/repositories/metadata-crawler.repository.interface';
import type {
  AssignMetadataCrawlerInput,
  MetadataCrawler,
  MetadataCrawlerAssignableService,
  MetadataCrawlerListPage,
  MetadataCrawlerLog,
  MetadataCrawlerRun,
  UpdateMetadataCrawlerInput,
} from '@/src/entities/models/metadata-crawler';

export interface MetadataCrawlerUseCases {
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

export const createMetadataCrawlerUseCases = (
  repository: MetadataCrawlerRepository,
): MetadataCrawlerUseCases => ({
  list: (includeArchived = false) => repository.list(includeArchived),
  get: (id) => repository.get(id),
  listAssignableDatabaseServices: () => repository.listAssignableDatabaseServices(),
  assign: (input) => repository.assign(input),
  update: (id, input) => repository.update(id, input),
  archive: (id) => repository.archive(id),
  runNow: (id) => repository.runNow(id),
  listRuns: (id, limit) => repository.listRuns(id, limit),
  getRunLogs: (runId) => repository.getRunLogs(runId),
});

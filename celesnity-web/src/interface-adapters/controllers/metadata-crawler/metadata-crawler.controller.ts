import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  AssignMetadataCrawlerInput,
  UpdateMetadataCrawlerInput,
} from '@/src/entities/models/metadata-crawler';
import type { MetadataCrawlerUseCases } from '@/src/application/use-cases/metadata-crawler/metadata-crawler.use-cases';
import {
  presentAssignableMetadataServices,
  presentMetadataCrawler,
  presentMetadataCrawlerLog,
  presentMetadataCrawlerPage,
  presentMetadataCrawlerRun,
} from '@/src/interface-adapters/presenters/metadata-crawler.presenter';

import {
  assignMetadataCrawlerInputSchema,
  metadataCrawlerIdSchema,
  metadataCrawlerListQuerySchema,
  metadataCrawlerRunListQuerySchema,
  updateMetadataCrawlerInputSchema,
} from './metadata-crawler.schemas';

export interface MetadataCrawlerController {
  list(query?: { readonly includeArchived?: boolean }): ReturnType<MetadataCrawlerUseCases['list']>;
  get(id: string): ReturnType<MetadataCrawlerUseCases['get']>;
  listAssignableDatabaseServices: MetadataCrawlerUseCases['listAssignableDatabaseServices'];
  assign(input: AssignMetadataCrawlerInput): ReturnType<MetadataCrawlerUseCases['assign']>;
  update(
    id: string,
    input: UpdateMetadataCrawlerInput,
  ): ReturnType<MetadataCrawlerUseCases['update']>;
  archive(id: string): ReturnType<MetadataCrawlerUseCases['archive']>;
  runNow(id: string): ReturnType<MetadataCrawlerUseCases['runNow']>;
  listRuns(
    id: string,
    query?: { readonly limit?: number },
  ): ReturnType<MetadataCrawlerUseCases['listRuns']>;
  getRunLogs(runId: string): ReturnType<MetadataCrawlerUseCases['getRunLogs']>;
}

export const createMetadataCrawlerController = (
  useCases: MetadataCrawlerUseCases,
): MetadataCrawlerController => ({
  async list(query) {
    const parsed = metadataCrawlerListQuerySchema.safeParse(query ?? {});
    if (!parsed.success)
      throw new InputParseError('Invalid metadata crawler list query', { cause: parsed.error });
    return presentMetadataCrawlerPage(await useCases.list(parsed.data.includeArchived));
  },
  async get(id) {
    return presentMetadataCrawler(await useCases.get(parseId(id)));
  },
  async listAssignableDatabaseServices() {
    return presentAssignableMetadataServices(await useCases.listAssignableDatabaseServices());
  },
  async assign(input) {
    const parsed = assignMetadataCrawlerInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid metadata crawler assignment', { cause: parsed.error });
    return presentMetadataCrawler(await useCases.assign(parsed.data));
  },
  async update(id, input) {
    const parsed = updateMetadataCrawlerInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid metadata crawler update', { cause: parsed.error });
    return presentMetadataCrawler(await useCases.update(parseId(id), parsed.data));
  },
  async archive(id) {
    await useCases.archive(parseId(id));
  },
  async runNow(id) {
    return presentMetadataCrawlerRun(await useCases.runNow(parseId(id)));
  },
  async listRuns(id, query) {
    const parsed = metadataCrawlerRunListQuerySchema.safeParse(query ?? {});
    if (!parsed.success)
      throw new InputParseError('Invalid metadata crawler run query', { cause: parsed.error });
    const runs = await useCases.listRuns(parseId(id), parsed.data.limit);
    return runs.map(presentMetadataCrawlerRun);
  },
  async getRunLogs(runId) {
    return presentMetadataCrawlerLog(await useCases.getRunLogs(parseId(runId)));
  },
});

function parseId(value: string): string {
  const parsed = metadataCrawlerIdSchema.safeParse(value);
  if (!parsed.success)
    throw new InputParseError('Invalid metadata crawler id', { cause: parsed.error });
  return parsed.data;
}

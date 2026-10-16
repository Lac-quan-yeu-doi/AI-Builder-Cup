import type { DataWorkflowUseCases } from '@/src/application/use-cases/data-workflow/data-workflow.use-cases';
import type {
  CreateDataWorkflowInput,
  DataWorkflowDetail,
  DataWorkflowSchedulePreview,
  DataWorkflowSchedule,
  DataWorkflowVersion,
  DataWorkflowRun,
  RetryDataWorkflowNodeInput,
  StartedDataWorkflowRun,
  UpdateDataWorkflowInput,
} from '@/src/entities/models/data-workflow';
import type { DataWorkflowPipelineTarget } from '@/src/entities/models/data-workflow-graph';
import type {
  DataWorkflowWatchSourceCapabilities,
  DataWorkflowWatchSourceCatalogPage,
  DataWorkflowWatchSourceCatalogQuery,
  DataWorkflowWatchSourceCatalogRelation,
  DataWorkflowWatchSourceCatalogService,
  DataWorkflowWatchSourceTrigger,
  DataWorkflowWatchSourceValidationResult,
} from '@/src/entities/models/data-workflow-watch-source';
import {
  presentDataWorkflowPage,
  type DataWorkflowPageViewModel,
} from '@/src/interface-adapters/presenters/data-workflow.presenter';

export interface DataWorkflowController {
  list(): Promise<DataWorkflowPageViewModel>;
  create(input: CreateDataWorkflowInput): Promise<DataWorkflowDetail>;
  get(id: string): Promise<DataWorkflowDetail>;
  save(input: UpdateDataWorkflowInput): Promise<DataWorkflowDetail>;
  publish(input: {
    readonly id: string;
    readonly expectedRevision: number;
  }): Promise<DataWorkflowVersion>;
  previewSchedule(
    id: string,
    source: 'DRAFT' | 'PUBLISHED',
    count: number,
  ): Promise<DataWorkflowSchedulePreview>;
  getSchedule(id: string): Promise<DataWorkflowSchedule>;
  setPaused(id: string, expectedRevision: number, paused: boolean): Promise<DataWorkflowDetail>;
  listVersions(id: string, limit?: number): Promise<readonly DataWorkflowVersion[]>;
  listRuns(id: string, limit?: number): Promise<readonly DataWorkflowRun[]>;
  startRun(id: string): Promise<StartedDataWorkflowRun>;
  retryNode(input: RetryDataWorkflowNodeInput): Promise<void>;
  getWatchSourceCapabilities(
    databaseServiceId: string,
  ): Promise<DataWorkflowWatchSourceCapabilities>;
  listWatchSourceCatalog(
    query?: DataWorkflowWatchSourceCatalogQuery,
  ): Promise<DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogService>>;
  listWatchSourceRelations(
    databaseServiceId: string,
    query?: DataWorkflowWatchSourceCatalogQuery,
  ): Promise<DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogRelation>>;
  validateWatchSource(
    trigger: DataWorkflowWatchSourceTrigger,
  ): Promise<DataWorkflowWatchSourceValidationResult>;
  listPipelineTargets(
    pipelineId: string,
    versionNumber: number,
  ): Promise<readonly DataWorkflowPipelineTarget[]>;
}

export const createDataWorkflowController = (
  useCases: DataWorkflowUseCases,
): DataWorkflowController => ({
  list: async () => presentDataWorkflowPage(await useCases.list({ page: 1, pageSize: 20 })),
  create: (input) => useCases.create(input),
  get: (id) => useCases.get(id),
  save: (input) => useCases.update(input),
  publish: ({ id, expectedRevision }) => useCases.publish(id, expectedRevision),
  previewSchedule: (id, source, count) => useCases.previewSchedule(id, source, count),
  getSchedule: (id) => useCases.getSchedule(id),
  setPaused: (id, expectedRevision, paused) => useCases.setPaused(id, expectedRevision, paused),
  listVersions: (id, limit = 20) => useCases.listVersions(id, limit),
  listRuns: (id, limit = 20) => useCases.listRuns(id, limit),
  startRun: (id) => useCases.startRun(id),
  retryNode: (input) => useCases.retryNode(input),
  getWatchSourceCapabilities: (databaseServiceId) =>
    useCases.getWatchSourceCapabilities(databaseServiceId),
  listWatchSourceCatalog: (query) => useCases.listWatchSourceCatalog(query),
  listWatchSourceRelations: (databaseServiceId, query) =>
    useCases.listWatchSourceRelations(databaseServiceId, query),
  validateWatchSource: (trigger) => useCases.validateWatchSource(trigger),
  listPipelineTargets: (pipelineId, versionNumber) =>
    useCases.listPipelineTargets(pipelineId, versionNumber),
});

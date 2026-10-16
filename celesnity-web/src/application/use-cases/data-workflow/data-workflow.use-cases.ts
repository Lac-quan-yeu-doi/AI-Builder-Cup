import type { DataWorkflowRepository } from '@/src/application/repositories/data-workflow.repository.interface';
import type {
  CreateDataWorkflowInput,
  DataWorkflowDetail,
  DataWorkflowPage,
  DataWorkflowSchedulePreview,
  DataWorkflowSchedule,
  DataWorkflowVersion,
  DataWorkflowRun,
  ListDataWorkflowsInput,
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

export interface DataWorkflowUseCases {
  list(input: ListDataWorkflowsInput): Promise<DataWorkflowPage>;
  create(input: CreateDataWorkflowInput): Promise<DataWorkflowDetail>;
  get(id: string): Promise<DataWorkflowDetail>;
  update(input: UpdateDataWorkflowInput): Promise<DataWorkflowDetail>;
  publish(id: string, expectedRevision: number): Promise<DataWorkflowVersion>;
  previewSchedule(
    id: string,
    source: 'DRAFT' | 'PUBLISHED',
    count: number,
  ): Promise<DataWorkflowSchedulePreview>;
  getSchedule(id: string): Promise<DataWorkflowSchedule>;
  setPaused(id: string, expectedRevision: number, paused: boolean): Promise<DataWorkflowDetail>;
  listVersions(id: string, limit: number): Promise<readonly DataWorkflowVersion[]>;
  listRuns(id: string, limit: number): Promise<readonly DataWorkflowRun[]>;
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

export const createDataWorkflowUseCases = (
  repository: DataWorkflowRepository,
): DataWorkflowUseCases => ({
  list: (input) => repository.list(input),
  create: (input) => repository.create(input),
  get: (id) => repository.get(id),
  update: (input) => repository.update(input),
  publish: (id, expectedRevision) => repository.publish(id, expectedRevision),
  previewSchedule: (id, source, count) => repository.previewSchedule(id, source, count),
  getSchedule: (id) => repository.getSchedule(id),
  setPaused: (id, expectedRevision, paused) => repository.setPaused(id, expectedRevision, paused),
  listVersions: (id, limit) => repository.listVersions(id, limit),
  listRuns: (id, limit) => repository.listRuns(id, limit),
  startRun: (id) => repository.startRun(id),
  retryNode: (input) => repository.retryNode(input),
  getWatchSourceCapabilities: (databaseServiceId) =>
    repository.getWatchSourceCapabilities(databaseServiceId),
  listWatchSourceCatalog: (query) => repository.listWatchSourceCatalog(query),
  listWatchSourceRelations: (databaseServiceId, query) =>
    repository.listWatchSourceRelations(databaseServiceId, query),
  validateWatchSource: (trigger) => repository.validateWatchSource(trigger),
  listPipelineTargets: (pipelineId, versionNumber) =>
    repository.listPipelineTargets(pipelineId, versionNumber),
});

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

export interface DataWorkflowRepository {
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

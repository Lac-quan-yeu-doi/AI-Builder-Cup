import type {
  NodePreview,
  Pipeline,
  PipelineGraph,
  PipelinePage,
  PipelineSummary,
  PipelineValidationIssue,
  PipelineValidationResult,
  PipelineNodeSchema,
} from '@/src/entities/models/pipeline';

export interface PipelineSummaryViewModel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly status: 'DRAFT';
  readonly version: number;
  readonly lastRunStatus?: string;
  readonly lastRunAt?: string;
  /** Iceberg database this pipeline is filed under, set when it was created. */
  readonly databaseName?: string;
  /** Iceberg database this pipeline writes into; absent while it has no target. */
  readonly targetDatabase?: string;
  readonly sourceConnectionIds: readonly string[];
  readonly createdBy: string;
  readonly updatedAt: string;
}

export interface PipelinePageViewModel {
  readonly items: readonly PipelineSummaryViewModel[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PipelineViewModel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly status: 'DRAFT';
  readonly version: number;
  readonly graph: PipelineGraph;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PipelineValidationViewModel {
  readonly valid: boolean;
  readonly errors: readonly PipelineValidationIssue[];
  readonly warnings: readonly PipelineValidationIssue[];
  readonly nodeSchemas?: Readonly<Record<string, PipelineNodeSchema>>;
}

export type NodePreviewViewModel = NodePreview;

export function presentPipelineSummary(summary: PipelineSummary): PipelineSummaryViewModel {
  return {
    id: summary.id,
    name: summary.name,
    ...(summary.description ? { description: summary.description } : {}),
    status: summary.status,
    version: summary.version,
    ...(summary.lastRunStatus ? { lastRunStatus: summary.lastRunStatus } : {}),
    ...(summary.lastRunAt ? { lastRunAt: summary.lastRunAt } : {}),
    ...(summary.databaseName ? { databaseName: summary.databaseName } : {}),
    ...(summary.targetDatabase ? { targetDatabase: summary.targetDatabase } : {}),
    sourceConnectionIds: summary.sourceConnectionIds,
    createdBy: summary.createdBy.displayName,
    updatedAt: summary.updatedAt,
  };
}

export function presentPipelinePage(page: PipelinePage): PipelinePageViewModel {
  return {
    items: page.items.map(presentPipelineSummary),
    page: page.page,
    pageSize: page.pageSize,
    totalItems: page.totalItems,
    totalPages: page.totalPages,
  };
}

export function presentPipeline(pipeline: Pipeline): PipelineViewModel {
  return {
    id: pipeline.id,
    name: pipeline.name,
    ...(pipeline.description ? { description: pipeline.description } : {}),
    status: pipeline.status,
    version: pipeline.version,
    graph: pipeline.graph,
    createdBy: pipeline.createdBy.displayName,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  };
}

export function presentPipelineValidation(
  result: PipelineValidationResult,
): PipelineValidationViewModel {
  return {
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    ...(result.nodeSchemas === undefined ? {} : { nodeSchemas: result.nodeSchemas }),
  };
}

export function presentNodePreview(preview: NodePreview): NodePreviewViewModel {
  return preview;
}

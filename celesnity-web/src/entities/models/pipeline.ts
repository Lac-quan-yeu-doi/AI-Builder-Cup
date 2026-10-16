export interface PipelinePosition {
  readonly x: number;
  readonly y: number;
}

export interface PipelineNode {
  readonly id: string;
  readonly definitionType: string;
  readonly resourceId?: string;
  readonly position: PipelinePosition;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface PipelineEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
}

export interface PipelineGraph {
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
}

/** The only status the Core API assigns while authoring is in progress. */
export type PipelineStatus = 'DRAFT';

export interface PipelineAuthor {
  readonly id: string;
  readonly displayName: string;
}

export interface PipelineSummary {
  readonly id: string;
  readonly name: string;
  /** Iceberg database this pipeline is filed under, set when it was created. */
  readonly databaseName?: string;
  readonly description?: string;
  readonly status: PipelineStatus;
  readonly version: number;
  readonly lastRunStatus?: string;
  readonly lastRunAt?: string;
  /**
   * Iceberg database the pipeline writes into, summarized by Core from the
   * target node. Absent for a draft with no target, and for a graph whose
   * targets name more than one database.
   */
  readonly targetDatabase?: string;
  /** Database services the source nodes read through. */
  readonly sourceConnectionIds: readonly string[];
  readonly createdBy: PipelineAuthor;
  readonly updatedAt: string;
}

export interface Pipeline {
  readonly id: string;
  readonly name: string;
  /** Iceberg database this pipeline is filed under, set when it was created. */
  readonly databaseName?: string;
  readonly description?: string;
  readonly status: PipelineStatus;
  readonly version: number;
  readonly graph: PipelineGraph;
  readonly createdBy: PipelineAuthor;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PipelinePage {
  readonly items: readonly PipelineSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ListPipelinesQuery {
  readonly keyword?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PipelineDraft {
  readonly name: string;
  /** Files the pipeline under an Iceberg database from the moment it exists. */
  readonly databaseName?: string;
  readonly description?: string;
  readonly graph: PipelineGraph;
}

export interface SavePipelineInput extends PipelineDraft {
  readonly version: number;
}

export interface PipelineValidationIssue {
  readonly code: string;
  readonly message: string;
  /** Added by the Web validation boundary when Core returns errors and warnings separately. */
  readonly severity?: 'ERROR' | 'WARNING';
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly field?: string;
}

export interface PipelineDatasetColumn {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
}

export interface PipelineNodeSchema {
  readonly status: 'KNOWN' | 'RUNTIME_DEPENDENT' | 'UNAVAILABLE';
  readonly columns: readonly PipelineDatasetColumn[];
}

export interface PipelineValidationResult {
  readonly valid: boolean;
  readonly errors: readonly PipelineValidationIssue[];
  readonly warnings: readonly PipelineValidationIssue[];
  readonly nodeSchemas?: Readonly<Record<string, PipelineNodeSchema>>;
}

export interface NodePreviewColumn {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
}

export interface NodePreview {
  readonly columns: readonly NodePreviewColumn[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly returnedRows: number;
  readonly truncated: boolean;
  readonly executionTimeMs: number;
}

export interface PreviewNodeInput {
  readonly pipelineVersion: number;
  readonly limit: number;
}

export interface PipelineCompilation {
  readonly pipelineId: string;
  readonly pipelineVersionId: string;
  readonly versionNumber: number;
  readonly compilerVersion: string;
  readonly semanticGraphSha256: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly sourceMap: unknown;
  readonly compiledAt: string;
  readonly source?: string;
}

export interface GeneratedPipelineScript extends PipelineCompilation {
  readonly source: string;
}

export interface PipelineExecutionAccepted {
  readonly executionId: string;
  readonly status: 'QUEUED';
}

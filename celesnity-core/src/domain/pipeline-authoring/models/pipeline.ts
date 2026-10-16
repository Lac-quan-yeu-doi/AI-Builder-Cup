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
  readonly id?: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
}

export interface PipelineGraph {
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
}

export interface Pipeline {
  readonly id: string;
  readonly name: string;
  /**
   * Iceberg database the pipeline is filed under. Set when it is created from
   * inside one; absent for a pipeline created before databases owned anything,
   * or created outside a database.
   */
  readonly databaseName?: string;
  readonly description?: string;
  readonly status: 'DRAFT';
  readonly version: number;
  readonly graph: PipelineGraph;
  readonly createdBy: { readonly id: string; readonly displayName: string };
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PipelineValidationIssue {
  readonly code: string;
  readonly message: string;
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

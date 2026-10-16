import type { PipelineReference } from '@application/data-workflow/interfaces/i-workflow-access';

export interface WorkflowPipelineTargetColumn {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
}

export interface WorkflowPipelineTargetSchema {
  readonly targetNodeId: string;
  readonly tableName: string;
  readonly schemaStatus: 'KNOWN' | 'RUNTIME_DEPENDENT' | 'UNAVAILABLE';
  readonly columns: readonly WorkflowPipelineTargetColumn[];
}

/** Reads the target schemas from one immutable, already-authorized pipeline version. */
export interface IWorkflowTargetSchemaReader {
  describe(pipeline: PipelineReference): Promise<readonly WorkflowPipelineTargetSchema[]>;
}

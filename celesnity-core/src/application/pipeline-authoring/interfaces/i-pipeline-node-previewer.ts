import type { Pipeline, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';

export interface NodePreviewResult {
  readonly columns: readonly {
    readonly name: string;
    readonly dataType: string;
    readonly nullable: boolean;
  }[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly returnedRows: number;
  readonly truncated: boolean;
  readonly executionTimeMs: number;
}

export interface IPipelineNodePreviewer {
  preview(pipeline: Pipeline, node: PipelineNode, limit: number): Promise<NodePreviewResult>;
}

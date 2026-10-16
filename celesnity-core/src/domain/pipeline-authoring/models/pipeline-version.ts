import type { PipelineGraph } from '@domain/pipeline-authoring/models/pipeline';

export interface PipelineVersionSnapshot {
  readonly id: string;
  readonly pipelineId: string;
  readonly versionNumber: number;
  readonly graph: PipelineGraph;
  readonly createdAt: string;
}

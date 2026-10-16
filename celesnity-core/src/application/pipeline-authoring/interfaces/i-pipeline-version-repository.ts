import type { PipelineVersionSnapshot } from '@domain/pipeline-authoring/models/pipeline-version';

export interface IPipelineVersionRepository {
  createSnapshot(snapshot: PipelineVersionSnapshot): Promise<void>;
  find(pipelineId: string, versionNumber: number): Promise<PipelineVersionSnapshot | undefined>;
}

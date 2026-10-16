import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { PreviewNodeInput } from '@/src/entities/models/pipeline';

export type PreviewPipelineNodeUseCase = ReturnType<typeof createPreviewPipelineNodeUseCase>;

export const createPreviewPipelineNodeUseCase =
  (repository: PipelineRepository) =>
  (pipelineId: string, nodeId: string, input: PreviewNodeInput) =>
    repository.previewNode(pipelineId, nodeId, input);

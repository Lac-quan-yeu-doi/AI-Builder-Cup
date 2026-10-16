import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';

export type ClonePipelineUseCase = ReturnType<typeof createClonePipelineUseCase>;

export const createClonePipelineUseCase =
  (repository: PipelineRepository) => (pipelineId: string, name: string) =>
    repository.clone(pipelineId, name);

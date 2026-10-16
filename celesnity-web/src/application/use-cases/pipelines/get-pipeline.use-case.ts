import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';

export type GetPipelineUseCase = ReturnType<typeof createGetPipelineUseCase>;

export const createGetPipelineUseCase = (repository: PipelineRepository) => (pipelineId: string) =>
  repository.get(pipelineId);

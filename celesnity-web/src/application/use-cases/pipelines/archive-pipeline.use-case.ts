import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';

export type ArchivePipelineUseCase = ReturnType<typeof createArchivePipelineUseCase>;

export const createArchivePipelineUseCase =
  (repository: PipelineRepository) => (pipelineId: string) =>
    repository.archive(pipelineId);

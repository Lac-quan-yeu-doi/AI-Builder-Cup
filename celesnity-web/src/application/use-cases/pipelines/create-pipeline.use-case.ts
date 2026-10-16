import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { PipelineDraft } from '@/src/entities/models/pipeline';

export type CreatePipelineUseCase = ReturnType<typeof createCreatePipelineUseCase>;

export const createCreatePipelineUseCase =
  (repository: PipelineRepository) => (draft: PipelineDraft) =>
    repository.create(draft);

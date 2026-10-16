import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { SavePipelineInput } from '@/src/entities/models/pipeline';

export type SavePipelineUseCase = ReturnType<typeof createSavePipelineUseCase>;

export const createSavePipelineUseCase =
  (repository: PipelineRepository) => (pipelineId: string, input: SavePipelineInput) =>
    repository.save(pipelineId, input);

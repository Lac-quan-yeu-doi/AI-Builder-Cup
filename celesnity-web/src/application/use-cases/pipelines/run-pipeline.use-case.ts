import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';

export type RunPipelineUseCase = ReturnType<typeof createRunPipelineUseCase>;

export const createRunPipelineUseCase =
  (repository: PipelineRepository) => async (pipelineId: string, version: number) => {
    await repository.compile(pipelineId, version);
    return repository.run(pipelineId, version);
  };

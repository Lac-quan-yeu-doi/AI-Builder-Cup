import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import { NotFoundError } from '@/src/entities/errors/application-errors';

export type GetOrCompilePipelineScriptUseCase = ReturnType<
  typeof createGetOrCompilePipelineScriptUseCase
>;

export const createGetOrCompilePipelineScriptUseCase =
  (repository: PipelineRepository) => async (pipelineId: string, version: number) => {
    try {
      return await repository.generatedScript(pipelineId, version);
    } catch (error) {
      if (!(error instanceof NotFoundError)) {
        throw error;
      }
      await repository.compile(pipelineId, version);
      return repository.generatedScript(pipelineId, version);
    }
  };

import type { RunPipelineUseCase } from '@/src/application/use-cases/pipelines/run-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { z } from 'zod';

const runPipelineSchema = z.object({
  pipelineId: z.string().uuid(),
  version: z.number().int().positive(),
});

export type RunPipelineController = ReturnType<typeof createRunPipelineController>;

export const createRunPipelineController =
  (useCase: RunPipelineUseCase) => async (pipelineId: string, version: number) => {
    const parsed = runPipelineSchema.safeParse({ pipelineId, version });
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline run request', { cause: parsed.error });
    }
    return useCase(parsed.data.pipelineId, parsed.data.version);
  };

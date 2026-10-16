import type { GetOrCompilePipelineScriptUseCase } from '@/src/application/use-cases/pipelines/get-or-compile-pipeline-script.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { z } from 'zod';

const requestSchema = z.object({
  pipelineId: z.string().uuid(),
  version: z.number().int().positive(),
});

export type GetPipelineScriptController = ReturnType<typeof createGetPipelineScriptController>;

export const createGetPipelineScriptController =
  (useCase: GetOrCompilePipelineScriptUseCase) => async (pipelineId: string, version: number) => {
    const parsed = requestSchema.safeParse({ pipelineId, version });
    if (!parsed.success) {
      throw new InputParseError('Invalid generated pipeline script request', {
        cause: parsed.error,
      });
    }
    return useCase(parsed.data.pipelineId, parsed.data.version);
  };

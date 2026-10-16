import type { GetPipelineUseCase } from '@/src/application/use-cases/pipelines/get-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentPipeline,
  type PipelineViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { pipelineIdSchema } from './pipeline.schemas';

export type GetPipelineController = ReturnType<typeof createGetPipelineController>;

export const createGetPipelineController =
  (useCase: GetPipelineUseCase): ((pipelineId: string) => Promise<PipelineViewModel>) =>
  async (pipelineId) => {
    const parsed = pipelineIdSchema.safeParse(pipelineId);
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline identifier', { cause: parsed.error });
    }
    return presentPipeline(await useCase(parsed.data));
  };

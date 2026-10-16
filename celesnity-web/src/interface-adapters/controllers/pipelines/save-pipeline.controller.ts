import type { SavePipelineUseCase } from '@/src/application/use-cases/pipelines/save-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { SavePipelineInput } from '@/src/entities/models/pipeline';
import {
  presentPipeline,
  type PipelineViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { savePipelineSchema } from './pipeline.schemas';

export type SavePipelineController = ReturnType<typeof createSavePipelineController>;

export const createSavePipelineController =
  (
    useCase: SavePipelineUseCase,
  ): ((pipelineId: string, input: SavePipelineInput) => Promise<PipelineViewModel>) =>
  async (pipelineId, input) => {
    const parsed = savePipelineSchema.safeParse({ pipelineId, input });
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline save request', { cause: parsed.error });
    }
    return presentPipeline(await useCase(parsed.data.pipelineId, parsed.data.input));
  };

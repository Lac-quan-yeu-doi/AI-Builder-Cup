import type { CreatePipelineUseCase } from '@/src/application/use-cases/pipelines/create-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { PipelineDraft } from '@/src/entities/models/pipeline';
import {
  presentPipeline,
  type PipelineViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { pipelineDraftSchema } from './pipeline.schemas';

export type CreatePipelineController = ReturnType<typeof createCreatePipelineController>;

export const createCreatePipelineController =
  (useCase: CreatePipelineUseCase): ((draft: PipelineDraft) => Promise<PipelineViewModel>) =>
  async (draft) => {
    const parsed = pipelineDraftSchema.safeParse(draft);
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline draft', { cause: parsed.error });
    }
    return presentPipeline(await useCase(parsed.data));
  };

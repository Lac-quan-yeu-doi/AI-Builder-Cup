import type { ClonePipelineUseCase } from '@/src/application/use-cases/pipelines/clone-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentPipeline,
  type PipelineViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { clonePipelineSchema } from './pipeline.schemas';

export type ClonePipelineController = ReturnType<typeof createClonePipelineController>;

export const createClonePipelineController =
  (
    useCase: ClonePipelineUseCase,
  ): ((pipelineId: string, name: string) => Promise<PipelineViewModel>) =>
  async (pipelineId, name) => {
    const parsed = clonePipelineSchema.safeParse({ pipelineId, name });
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline clone request', { cause: parsed.error });
    }
    return presentPipeline(await useCase(parsed.data.pipelineId, parsed.data.name));
  };

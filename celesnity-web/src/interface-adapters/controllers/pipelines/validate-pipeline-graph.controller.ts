import type { ValidatePipelineGraphUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-graph.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { PipelineGraph } from '@/src/entities/models/pipeline';
import {
  presentPipelineValidation,
  type PipelineValidationViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { pipelineGraphSchema } from './pipeline.schemas';

export type ValidatePipelineGraphController = ReturnType<
  typeof createValidatePipelineGraphController
>;

export const createValidatePipelineGraphController =
  (
    useCase: ValidatePipelineGraphUseCase,
  ): ((graph: PipelineGraph) => Promise<PipelineValidationViewModel>) =>
  async (graph) => {
    const parsed = pipelineGraphSchema.safeParse(graph);
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline graph', { cause: parsed.error });
    }
    return presentPipelineValidation(await useCase(parsed.data));
  };

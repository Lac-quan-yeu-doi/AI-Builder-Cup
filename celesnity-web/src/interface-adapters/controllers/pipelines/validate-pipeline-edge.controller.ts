import type { ValidatePipelineEdgeUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-edge.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { PipelineEdge, PipelineGraph } from '@/src/entities/models/pipeline';
import {
  presentPipelineValidation,
  type PipelineValidationViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { validateEdgeSchema } from './pipeline.schemas';

export type ValidatePipelineEdgeController = ReturnType<
  typeof createValidatePipelineEdgeController
>;

export const createValidatePipelineEdgeController =
  (
    useCase: ValidatePipelineEdgeUseCase,
  ): ((graph: PipelineGraph, edge: PipelineEdge) => Promise<PipelineValidationViewModel>) =>
  async (graph, edge) => {
    const parsed = validateEdgeSchema.safeParse({ graph, edge });
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline edge', { cause: parsed.error });
    }
    return presentPipelineValidation(await useCase(parsed.data.graph, parsed.data.edge));
  };

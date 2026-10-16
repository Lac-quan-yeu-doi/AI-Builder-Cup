import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { PipelineGraph } from '@/src/entities/models/pipeline';

export type ValidatePipelineGraphUseCase = ReturnType<typeof createValidatePipelineGraphUseCase>;

/**
 * Validates the graph held in the editor rather than the saved one, so authors
 * can check their work before publishing a version.
 */
export const createValidatePipelineGraphUseCase =
  (repository: PipelineRepository) => (graph: PipelineGraph) =>
    repository.validateGraph(graph);

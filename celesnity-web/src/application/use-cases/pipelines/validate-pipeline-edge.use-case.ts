import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { PipelineEdge, PipelineGraph } from '@/src/entities/models/pipeline';

export type ValidatePipelineEdgeUseCase = ReturnType<typeof createValidatePipelineEdgeUseCase>;

export const createValidatePipelineEdgeUseCase =
  (repository: PipelineRepository) => (graph: PipelineGraph, edge: PipelineEdge) =>
    repository.validateEdge(graph, edge);

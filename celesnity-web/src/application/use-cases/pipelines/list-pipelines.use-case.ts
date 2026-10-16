import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { ListPipelinesQuery } from '@/src/entities/models/pipeline';

export type ListPipelinesUseCase = ReturnType<typeof createListPipelinesUseCase>;

export const createListPipelinesUseCase =
  (repository: PipelineRepository) => (query: ListPipelinesQuery) =>
    repository.list(query);

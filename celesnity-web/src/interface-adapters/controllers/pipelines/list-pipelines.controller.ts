import type { ListPipelinesUseCase } from '@/src/application/use-cases/pipelines/list-pipelines.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ListPipelinesQuery } from '@/src/entities/models/pipeline';
import {
  presentPipelinePage,
  type PipelinePageViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { listPipelinesQuerySchema } from './pipeline.schemas';

export type ListPipelinesController = ReturnType<typeof createListPipelinesController>;

export const createListPipelinesController =
  (
    useCase: ListPipelinesUseCase,
  ): ((query?: ListPipelinesQuery) => Promise<PipelinePageViewModel>) =>
  async (query = {}) => {
    const parsed = listPipelinesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline list query', { cause: parsed.error });
    }
    return presentPipelinePage(await useCase(parsed.data));
  };

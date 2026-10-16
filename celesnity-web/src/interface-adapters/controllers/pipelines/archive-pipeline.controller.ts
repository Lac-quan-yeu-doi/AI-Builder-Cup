import type { ArchivePipelineUseCase } from '@/src/application/use-cases/pipelines/archive-pipeline.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { pipelineIdSchema } from './pipeline.schemas';

export type ArchivePipelineController = ReturnType<typeof createArchivePipelineController>;

export const createArchivePipelineController =
  (useCase: ArchivePipelineUseCase): ((pipelineId: string) => Promise<void>) =>
  async (pipelineId) => {
    const parsed = pipelineIdSchema.safeParse(pipelineId);
    if (!parsed.success) {
      throw new InputParseError('Invalid pipeline identifier', { cause: parsed.error });
    }
    await useCase(parsed.data);
  };

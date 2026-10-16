import type { PreviewPipelineNodeUseCase } from '@/src/application/use-cases/pipelines/preview-pipeline-node.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { PreviewNodeInput } from '@/src/entities/models/pipeline';
import {
  presentNodePreview,
  type NodePreviewViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

import { previewNodeSchema } from './pipeline.schemas';

export type PreviewPipelineNodeController = ReturnType<typeof createPreviewPipelineNodeController>;

export const createPreviewPipelineNodeController =
  (
    useCase: PreviewPipelineNodeUseCase,
  ): ((
    pipelineId: string,
    nodeId: string,
    input: PreviewNodeInput,
  ) => Promise<NodePreviewViewModel>) =>
  async (pipelineId, nodeId, input) => {
    const parsed = previewNodeSchema.safeParse({ pipelineId, nodeId, input });
    if (!parsed.success) {
      throw new InputParseError('Invalid node preview request', { cause: parsed.error });
    }
    return presentNodePreview(
      await useCase(parsed.data.pipelineId, parsed.data.nodeId, parsed.data.input),
    );
  };

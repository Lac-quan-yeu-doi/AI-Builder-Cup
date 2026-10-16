import { Injectable } from '@nestjs/common';

import type {
  IPipelineNodePreviewer,
  NodePreviewResult,
} from '@application/pipeline-authoring/interfaces/i-pipeline-node-previewer';
import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';

@Injectable()
export class UnavailablePipelineNodePreviewer implements IPipelineNodePreviewer {
  public preview(): Promise<NodePreviewResult> {
    return Promise.reject(
      PipelineError.previewFailed(
        'Node preview is unavailable until the graph-to-Spark compiler is configured.',
      ),
    );
  }
}

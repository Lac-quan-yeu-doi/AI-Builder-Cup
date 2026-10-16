export type PipelineCompilationErrorCode =
  | 'PIPELINE_ARTIFACT_NOT_FOUND'
  | 'PIPELINE_NOT_COMPILABLE'
  | 'NODE_COMPILER_NOT_FOUND'
  | 'NODE_CONFIG_INVALID'
  | 'SOURCE_COUNT_UNSUPPORTED'
  | 'NODE_INPUT_MISSING'
  | 'NODE_OUTPUT_MISSING'
  | 'LEGACY_FILTER_REJECTED_UNSUPPORTED';

export interface PipelineCompilationIssue {
  readonly code: PipelineCompilationErrorCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly field?: string;
}

export class PipelineCompilationError extends Error {
  public constructor(public readonly issues: readonly PipelineCompilationIssue[]) {
    super(issues[0]?.message ?? 'The pipeline cannot be compiled.');
    this.name = PipelineCompilationError.name;
  }

  public static issue(
    code: PipelineCompilationErrorCode,
    message: string,
    details: Pick<PipelineCompilationIssue, 'nodeId' | 'field'> = {},
  ): PipelineCompilationError {
    return new PipelineCompilationError([{ code, message, ...details }]);
  }
}

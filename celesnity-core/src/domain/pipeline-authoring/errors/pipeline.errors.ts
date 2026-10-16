export enum PipelineErrorCode {
  VALIDATION = 'PIPELINE_INVALID',
  NOT_FOUND = 'PIPELINE_NOT_FOUND',
  NAME_CONFLICT = 'PIPELINE_NAME_DUPLICATED',
  VERSION_CONFLICT = 'PIPELINE_VERSION_CONFLICT',
  PREVIEW_FAILED = 'NODE_PREVIEW_FAILED',
}

export class PipelineError extends Error {
  private constructor(
    public readonly code: PipelineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = PipelineError.name;
  }

  public static validation(message: string): PipelineError {
    return new PipelineError(PipelineErrorCode.VALIDATION, message);
  }
  public static notFound(): PipelineError {
    return new PipelineError(PipelineErrorCode.NOT_FOUND, 'The pipeline was not found.');
  }
  public static nameConflict(): PipelineError {
    return new PipelineError(
      PipelineErrorCode.NAME_CONFLICT,
      'A pipeline with this name already exists.',
    );
  }
  public static versionConflict(): PipelineError {
    return new PipelineError(
      PipelineErrorCode.VERSION_CONFLICT,
      'The pipeline version has changed.',
    );
  }
  public static previewFailed(message = 'Node preview could not be completed.'): PipelineError {
    return new PipelineError(PipelineErrorCode.PREVIEW_FAILED, message);
  }
}

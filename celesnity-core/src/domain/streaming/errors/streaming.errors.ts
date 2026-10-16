export enum StreamingErrorCode {
  VALIDATION = 'STREAM_ADAPTER_INVALID',
  NOT_FOUND = 'STREAM_ADAPTER_NOT_FOUND',
  NAME_CONFLICT = 'STREAM_ADAPTER_NAME_DUPLICATED',
  STATE_CONFLICT = 'STREAM_ADAPTER_STATE_CONFLICT',
}

export class StreamingError extends Error {
  private constructor(
    public readonly code: StreamingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = StreamingError.name;
  }

  public static validation(message: string): StreamingError {
    return new StreamingError(StreamingErrorCode.VALIDATION, message);
  }
  public static notFound(): StreamingError {
    return new StreamingError(StreamingErrorCode.NOT_FOUND, 'The MQTT adapter was not found.');
  }
  public static nameConflict(): StreamingError {
    return new StreamingError(
      StreamingErrorCode.NAME_CONFLICT,
      'An MQTT adapter with this name already exists for the tenant.',
    );
  }
  public static stateConflict(message: string): StreamingError {
    return new StreamingError(StreamingErrorCode.STATE_CONFLICT, message);
  }
}

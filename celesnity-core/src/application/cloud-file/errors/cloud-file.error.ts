export enum CloudFileErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  WRITE_FORBIDDEN = 'WRITE_FORBIDDEN',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  TOO_LARGE = 'TOO_LARGE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROVIDER_UNSUPPORTED = 'PROVIDER_UNSUPPORTED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
}

export class CloudFileError extends Error {
  public readonly code: CloudFileErrorCode;

  public constructor(code: CloudFileErrorCode, message: string) {
    super(message);
    this.name = 'CloudFileError';
    this.code = code;
  }

  public static is(error: unknown, ...codes: readonly CloudFileErrorCode[]): error is CloudFileError {
    return error instanceof CloudFileError && (codes.length === 0 || codes.includes(error.code));
  }
}

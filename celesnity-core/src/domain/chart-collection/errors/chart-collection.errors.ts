export class ChartCollectionError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.name = 'ChartCollectionError';
    this.code = code;
  }

  public static moveInvalid(reason: string): ChartCollectionError {
    return new ChartCollectionError(
      'COLLECTION_MOVE_INVALID',
      `COLLECTION_MOVE_INVALID: ${reason}`,
    );
  }

  public static accessDenied(): ChartCollectionError {
    return new ChartCollectionError('COLLECTION_ACCESS_DENIED', 'COLLECTION_ACCESS_DENIED');
  }

  public static notFound(): ChartCollectionError {
    return new ChartCollectionError('COLLECTION_NOT_FOUND', 'COLLECTION_NOT_FOUND');
  }

  public static validation(reason: string): ChartCollectionError {
    return new ChartCollectionError('COLLECTION_INVALID', `COLLECTION_INVALID: ${reason}`);
  }
}

export type TutorialErrorCode =
  'TUTORIAL_INVALID' | 'TUTORIAL_NOT_FOUND' | 'TUTORIAL_ACCESS_DENIED' | 'TUTORIAL_RUN_CONFLICT';

export class TutorialError extends Error {
  private constructor(
    public readonly code: TutorialErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TutorialError';
  }

  public static invalid(reason: string): TutorialError {
    return new TutorialError('TUTORIAL_INVALID', `TUTORIAL_INVALID: ${reason}`);
  }

  public static notFound(): TutorialError {
    return new TutorialError('TUTORIAL_NOT_FOUND', 'TUTORIAL_NOT_FOUND');
  }

  public static accessDenied(): TutorialError {
    return new TutorialError('TUTORIAL_ACCESS_DENIED', 'TUTORIAL_ACCESS_DENIED');
  }

  public static runConflict(): TutorialError {
    return new TutorialError(
      'TUTORIAL_RUN_CONFLICT',
      'TUTORIAL_RUN_CONFLICT: Pause the current tutorial before starting another one.',
    );
  }
}

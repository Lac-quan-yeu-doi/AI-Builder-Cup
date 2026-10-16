export class PendingActionError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PendingActionError';
  }

  public static notFound(id: string): PendingActionError {
    return new PendingActionError('PENDING_ACTION_NOT_FOUND', `Pending action not found: ${id}`);
  }

  public static notPending(id: string, status: string): PendingActionError {
    return new PendingActionError(
      'PENDING_ACTION_ALREADY_DECIDED',
      `Pending action ${id} was already ${status}.`,
    );
  }

  public static unknownAction(actionName: string): PendingActionError {
    return new PendingActionError(
      'PENDING_ACTION_UNKNOWN_ACTION',
      `No action named "${actionName}" is registered to run this pending action.`,
    );
  }

  public static expired(id: string, expiresAt: string): PendingActionError {
    return new PendingActionError(
      'PENDING_ACTION_EXPIRED',
      `Pending action ${id} expired at ${expiresAt} and can no longer be approved or rejected.`,
    );
  }
}

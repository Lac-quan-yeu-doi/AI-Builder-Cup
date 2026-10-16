export class InputParseError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InputParseError';
  }
}

export class NotFoundError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

export class FeatureAccessDeniedError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FeatureAccessDeniedError';
  }
}

export interface RemoteServiceErrorOptions extends ErrorOptions {
  /** Whether presentation code may safely show this message to an operator. */
  readonly exposeMessage?: boolean;
}

export class RemoteServiceError extends Error {
  public readonly exposeMessage: boolean;

  public constructor(message: string, options?: RemoteServiceErrorOptions) {
    super(message, options);
    this.name = 'RemoteServiceError';
    this.exposeMessage = options?.exposeMessage ?? false;
  }
}

export type PublicationViolation =
  | 'MISSING_ID'
  | 'MISSING_METADATA'
  | 'EMPTY_STEPS'
  | 'AMBIGUOUS_ACTION'
  | 'AMBIGUOUS_TARGET'
  | 'INVALID_EXPERIENCE'
  | 'METADATA_STEP_COUNT_MISMATCH';

export class TutorialPublicationError extends Error {
  public readonly violations: readonly PublicationViolation[];

  public constructor(violations: readonly PublicationViolation[]) {
    super('Tutorial publication was rejected because its definition is invalid.');
    this.name = 'TutorialPublicationError';
    this.violations = Object.freeze([...violations]);
  }
}

export class TutorialAccessError extends Error {
  public constructor() {
    super('Tutorial access is unavailable.');
    this.name = 'TutorialAccessError';
  }
}

export class ScriptPublishError extends Error {
  public constructor(
    public readonly persistedScript: import('../models/script').Script,
    public readonly reason: unknown,
  ) {
    super('The script metadata was saved, but its source version could not be published.', {
      cause: reason,
    });
    this.name = 'ScriptPublishError';
  }
}

export class ScriptRunError extends Error {
  public constructor(
    public readonly saved: import('../models/script').SaveScriptResult,
    public readonly reason: unknown,
  ) {
    super('The script version was saved, but its execution could not be started.', {
      cause: reason,
    });
    this.name = 'ScriptRunError';
  }
}

export type PasswordChangeErrorReason =
  | 'CURRENT_PASSWORD_INVALID'
  | 'NEW_PASSWORD_MISMATCH'
  | 'NEW_PASSWORD_REUSED'
  | 'NEW_PASSWORD_WEAK'
  | 'NO_PASSWORD_CHANGE_ACTIVE';

export class PasswordChangeError extends Error {
  public constructor(public readonly reason: PasswordChangeErrorReason) {
    super(`Password change failed: ${reason}`);
    this.name = 'PasswordChangeError';
  }
}

/**
 * Domain errors for the Script Authoring context.
 *
 * A single error type carries a discriminating {@link ScriptErrorCode} rather
 * than a separate class per variant. The HTTP adapter maps each code to a status.
 */

/**
 * Classifies a script-authoring failure.
 * - `VALIDATION` -> 400.
 * - `NOT_FOUND` -> 404: the script was not found.
 * - `VERSION_NOT_FOUND` -> 404: the published version was not found.
 * - `ARCHIVED` -> 409: an archived script cannot be changed.
 * - `DRAFT` -> 409: the script has no published version.
 * - `METADATA_CONFLICT` -> 409: the script changed during a metadata update.
 * - `PUBLICATION_CONFLICT` -> 409: the script changed during publication.
 */
export enum ScriptErrorCode {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  ARCHIVED = 'ARCHIVED',
  DRAFT = 'DRAFT',
  METADATA_CONFLICT = 'METADATA_CONFLICT',
  PUBLICATION_CONFLICT = 'PUBLICATION_CONFLICT',
}

/** The single error raised by the Script Authoring context. */
export class ScriptError extends Error {
  public readonly code: ScriptErrorCode;

  public constructor(code: ScriptErrorCode, message: string) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
  }

  public static validation(message: string): ScriptError {
    return new ScriptError(ScriptErrorCode.VALIDATION, message);
  }

  public static notFound(): ScriptError {
    return new ScriptError(ScriptErrorCode.NOT_FOUND, 'The script was not found.');
  }

  public static versionNotFound(): ScriptError {
    return new ScriptError(
      ScriptErrorCode.VERSION_NOT_FOUND,
      'The published script version was not found.',
    );
  }

  public static archived(): ScriptError {
    return new ScriptError(ScriptErrorCode.ARCHIVED, 'Archived scripts cannot be changed.');
  }

  public static draft(): ScriptError {
    return new ScriptError(ScriptErrorCode.DRAFT, 'The script does not have a published version.');
  }

  public static metadataConflict(): ScriptError {
    return new ScriptError(
      ScriptErrorCode.METADATA_CONFLICT,
      'The script changed while it was being updated. Retry with the latest metadata.',
    );
  }

  public static publicationConflict(): ScriptError {
    return new ScriptError(
      ScriptErrorCode.PUBLICATION_CONFLICT,
      'The script changed while a version was being published. Retry the publication.',
    );
  }
}

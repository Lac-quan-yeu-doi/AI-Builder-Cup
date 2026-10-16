import { SharedValidationMessage } from '@domain/shared/validation-messages';

/**
 * The text rule every value object in every context applies: trim, reject blank,
 * enforce a maximum length, reject an embedded NUL.
 *
 * Three contexts had a byte-identical private copy of this, differing only in
 * which error type it raised. A guard is bound to that error type once, then
 * shared by every value object in the context:
 *
 * ```ts
 * const text = TextGuard.reporting((message) => ConnectionError.validation(message));
 * // ...
 * text.required('Connection name', value, 120);
 * ```
 *
 * The NUL check is not cosmetic: a NUL byte can truncate a string when it
 * reaches PostgreSQL or a shell, so it is rejected at the boundary rather than
 * sanitised.
 */
export class TextGuard {
  private constructor(private readonly invalid: (message: string) => Error) {}

  /** Binds a guard to the error type its context raises for invalid input. */
  public static reporting(invalid: (message: string) => Error): TextGuard {
    return new TextGuard(invalid);
  }

  /**
   * Returns the trimmed value, or raises this guard's error type. Length is
   * measured after trimming, so padding cannot push a value over the limit.
   */
  public required(label: string, value: string, maximumLength: number): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw this.invalid(SharedValidationMessage.isRequired(label));
    }
    if (normalized.length > maximumLength) {
      throw this.invalid(SharedValidationMessage.mustNotExceedCharacters(label, maximumLength));
    }
    if (normalized.includes('\0')) {
      throw this.invalid(SharedValidationMessage.containsInvalidCharacter(label));
    }
    return normalized;
  }
}

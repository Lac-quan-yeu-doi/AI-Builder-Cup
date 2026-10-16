/**
 * Removes credentials from text before it is logged, stored, or returned.
 *
 * The patterns are private state rather than module constants, so what counts as
 * a secret is one object's responsibility. Order matters and is not incidental:
 * the URL form runs first because a connection string also satisfies the
 * key/value pattern, and the JSON form runs before the key/value form because the
 * latter would stop at the closing quote and leave a fragment behind.
 */
export class SecretRedactor {
  private readonly urlCredentials = /([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/giu;

  private readonly keyValueSecret =
    /\b(password|passwd|pwd|secret|secret[_-]?key|access[_-]?(?:key|token)|api[_-]?key|client[_-]?secret|private[_-]?key|token|authorization)\b(\s*[:=]\s*)([^\s,;}&]+)/giu;

  private readonly jsonSecret =
    /("(?:password|passwd|pwd|secret|secret[_-]?key|access[_-]?(?:key|token)|api[_-]?key|client[_-]?secret|private[_-]?key|token|authorization)"\s*:\s*")([^"]*)(")/giu;

  /** Replaces every recognised secret with a fixed placeholder. */
  public redact(value: string): string {
    return value
      .replace(this.urlCredentials, '$1$2:[REDACTED]@')
      .replace(this.jsonSecret, '$1[REDACTED]$3')
      .replace(this.keyValueSecret, '$1$2[REDACTED]');
  }

  /**
   * A message safe to surface for an arbitrary thrown value. A non-Error carries
   * no message worth trusting, so it is replaced outright rather than coerced.
   */
  public safeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return this.redact(error.message);
    }
    return 'An unexpected error occurred.';
  }
}

/**
 * The shared redactor.
 *
 * Redaction is stateless and is needed from bootstrap error handlers and value
 * mappers that are not container-managed, so one instance is exported rather than
 * threaded through constructors. It is deliberately the only way to reach this
 * behaviour: the module previously also exported free functions, which meant new
 * code could apply redaction without ever discovering the object that owns the
 * patterns.
 */
export const secretRedactor = new SecretRedactor();

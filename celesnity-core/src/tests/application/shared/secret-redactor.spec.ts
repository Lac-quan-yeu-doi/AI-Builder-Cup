import { SecretRedactor } from '@application/shared/secret-redactor';
import { FailureReason } from '@domain/database-service/value-objects/failure-reason';

const redactor = new SecretRedactor();

const redactSecrets = (value: string): string => redactor.redact(value);
const safeErrorMessage = (error: unknown): string => redactor.safeErrorMessage(error);

/**
 * Characterization of secret redaction as it behaves today. Task 7 turns these
 * free functions into a SecretRedactor collaborator; every expectation here is
 * the contract for that move.
 *
 * The plaintext assertions matter most: whatever else changes, a secret must
 * never survive redaction.
 */
describe('redactSecrets', () => {
  describe('URL credential pattern', () => {
    it('redacts the password in a URL while keeping the user', () => {
      expect(redactSecrets('postgresql://alice:s3cr3t@db.internal:5432/analytics')).toBe(
        'postgresql://alice:[REDACTED]@db.internal:5432/analytics',
      );
    });

    it('redacts URL credentials for any scheme', () => {
      expect(redactSecrets('https://user:hunter2@example.com/path')).toBe(
        'https://user:[REDACTED]@example.com/path',
      );
    });

    it('redacts every URL credential in a message', () => {
      const redacted = redactSecrets(
        'from postgresql://a:one@h1/db to postgresql://b:two@h2/db failed',
      );

      expect(redacted).not.toContain('one');
      expect(redacted).not.toContain('two');
      expect(redacted).toBe(
        'from postgresql://a:[REDACTED]@h1/db to postgresql://b:[REDACTED]@h2/db failed',
      );
    });

    it('leaves a URL without credentials untouched', () => {
      expect(redactSecrets('postgresql://db.internal:5432/analytics')).toBe(
        'postgresql://db.internal:5432/analytics',
      );
    });
  });

  describe('JSON secret pattern', () => {
    it.each(['password', 'passwd', 'pwd', 'secret', 'secretKey', 'accessKey', 'authorization'])(
      'redacts a JSON "%s" member',
      (key) => {
        const redacted = redactSecrets(`{"${key}":"s3cr3t","host":"db"}`);

        expect(redacted).toBe(`{"${key}":"[REDACTED]","host":"db"}`);
        expect(redacted).not.toContain('s3cr3t');
      },
    );

    it('redacts a JSON member regardless of key casing', () => {
      expect(redactSecrets('{"Password":"s3cr3t"}')).toBe('{"Password":"[REDACTED]"}');
    });

    it('redacts an empty JSON secret value', () => {
      expect(redactSecrets('{"password":""}')).toBe('{"password":"[REDACTED]"}');
    });

    it('tolerates whitespace around the colon', () => {
      expect(redactSecrets('{"password" : "s3cr3t"}')).toBe('{"password" : "[REDACTED]"}');
    });

    it.each(['accessToken', 'apiKey', 'clientSecret', 'privateKey'])(
      'redacts a DBMS credential member named %s',
      (key) => {
        const redacted = redactSecrets(`{"${key}":"s3cr3t","host":"db"}`);

        expect(redacted).toBe(`{"${key}":"[REDACTED]","host":"db"}`);
      },
    );
  });

  describe('key/value secret pattern', () => {
    it.each([
      'password',
      'passwd',
      'pwd',
      'secret',
      'secret_key',
      'secret-key',
      'access_key',
      'access-key',
      'authorization',
    ])('redacts a "%s=" assignment', (key) => {
      const redacted = redactSecrets(`${key}=s3cr3t host=db`);

      expect(redacted).toBe(`${key}=[REDACTED] host=db`);
      expect(redacted).not.toContain('s3cr3t');
    });

    it('redacts a colon-separated assignment', () => {
      expect(redactSecrets('password: s3cr3t')).toBe('password: [REDACTED]');
    });

    it('stops at the delimiter so following context survives', () => {
      expect(redactSecrets('password=s3cr3t,host=db')).toBe('password=[REDACTED],host=db');
      expect(redactSecrets('password=s3cr3t;host=db')).toBe('password=[REDACTED];host=db');
      expect(redactSecrets('password=s3cr3t&host=db')).toBe('password=[REDACTED]&host=db');
      expect(redactSecrets('{password=s3cr3t}')).toBe('{password=[REDACTED]}');
    });

    it('redacts case-insensitively', () => {
      expect(redactSecrets('PASSWORD=s3cr3t')).toBe('PASSWORD=[REDACTED]');
    });

    it.each(['access_token', 'api-key', 'clientSecret', 'private_key'])(
      'redacts a DBMS credential assignment named %s',
      (key) => {
        expect(redactSecrets(`${key}=s3cr3t host=db`)).toBe(`${key}=[REDACTED] host=db`);
      },
    );

    it('does not redact a key that merely contains a secret word', () => {
      // The pattern is word-bounded, so `mypassword` is not treated as a secret key.
      expect(redactSecrets('mypassword=s3cr3t')).toBe('mypassword=s3cr3t');
    });
  });

  it('leaves a message with no secrets untouched', () => {
    expect(redactSecrets('connection refused')).toBe('connection refused');
  });

  it('handles an empty string', () => {
    expect(redactSecrets('')).toBe('');
  });

  it('redacts a message that trips more than one pattern', () => {
    const redacted = redactSecrets(
      'postgresql://alice:urlpass@db/analytics failed; password=kvpass; {"secret":"jsonpass"}',
    );

    expect(redacted).not.toContain('urlpass');
    expect(redacted).not.toContain('kvpass');
    expect(redacted).not.toContain('jsonpass');
  });
});

describe('safeErrorMessage', () => {
  it('redacts the message of an Error', () => {
    expect(safeErrorMessage(new Error('password=s3cr3t'))).toBe('password=[REDACTED]');
  });

  it('returns a generic message for a non-Error', () => {
    expect(safeErrorMessage('password=s3cr3t')).toBe('An unexpected error occurred.');
    expect(safeErrorMessage(undefined)).toBe('An unexpected error occurred.');
    expect(safeErrorMessage({ message: 'x' })).toBe('An unexpected error occurred.');
  });

  it('returns an empty string for an Error with an empty message', () => {
    expect(safeErrorMessage(new Error(''))).toBe('');
  });
});

/**
 * `sanitizedFailureReason` used to live here: it redacted a thrown value, then
 * trimmed, substituted a fallback, and truncated to 500 characters.
 *
 * Task 7 found it had no production caller — only this specification. Every
 * failure reason that actually reaches a connection is already a curated string:
 * PgConnectionTester maps error codes to a fixed safe set, and the destination
 * policy raises static messages. So it was deleted rather than preserved.
 *
 * Its two halves are still covered: redaction above, and the trim, fallback, and
 * length bound in the FailureReason specification, which is where the use case's
 * own duplicate of that logic now lives.
 */
describe('composition with FailureReason', () => {
  it('produces a safe message that FailureReason can then normalize', () => {
    const composed = FailureReason.from(
      redactor.safeErrorMessage(new Error('  password=s3cr3t  ')),
    );

    expect(composed.value).toBe('password=[REDACTED]');
  });

  it('keeps the two responsibilities separable', () => {
    // The redactor decides what is safe to keep; FailureReason decides the
    // fallback and the length bound. Neither knows the other's rule.
    expect(redactor.safeErrorMessage(new Error('   '))).toBe('   ');
    expect(FailureReason.from('   ').value).toBe('Database connection verification failed.');
  });

  it('bounds a long redacted message', () => {
    const composed = FailureReason.from(redactor.safeErrorMessage(new Error('a'.repeat(600))));

    expect(composed.value).toHaveLength(500);
  });
});

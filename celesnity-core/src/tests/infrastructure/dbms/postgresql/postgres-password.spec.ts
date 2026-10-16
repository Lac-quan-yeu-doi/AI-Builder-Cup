import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { PostgresPassword } from '@infrastructure/dbms/postgresql/postgres-password';

describe('PostgresPassword', () => {
  it('does not trim, because surrounding whitespace is part of the credential', () => {
    expect(PostgresPassword.create('  spaced  ').value).toBe('  spaced  ');
  });

  it('accepts exactly 4096 characters and rejects 4097', () => {
    expect(PostgresPassword.create('a'.repeat(4096)).value).toHaveLength(4096);
    expect(() => PostgresPassword.create('a'.repeat(4097))).toThrow(
      'Database password must not exceed 4096 characters.',
    );
  });

  it.each([
    ['', 'Database password must not be empty.'],
    ['pass\0word', 'Database password contains an invalid character.'],
  ])('rejects %p', (value, message) => {
    expect(() => PostgresPassword.create(value)).toThrow(message);
    expect(() => PostgresPassword.create(value)).toThrow(ConnectionError);
  });

  describe('createOptional', () => {
    it('passes undefined straight through', () => {
      expect(PostgresPassword.createOptional(undefined)).toBeUndefined();
    });

    it('still validates a value that is present', () => {
      expect(() => PostgresPassword.createOptional('')).toThrow(
        'Database password must not be empty.',
      );
    });
  });

  describe('secret-safe rendering', () => {
    it('redacts itself in JSON.stringify', () => {
      const serialized = JSON.stringify({ password: PostgresPassword.create('s3cr3t') });

      expect(serialized).not.toContain('s3cr3t');
      expect(serialized).toContain('[REDACTED]');
    });

    it('redacts itself when coerced to a string', () => {
      expect(String(PostgresPassword.create('s3cr3t'))).toBe('[REDACTED]');
    });

    it('still exposes the secret through .value for the code that needs it', () => {
      expect(PostgresPassword.create('s3cr3t').value).toBe('s3cr3t');
    });
  });
});

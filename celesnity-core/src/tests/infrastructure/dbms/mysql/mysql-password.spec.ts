import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { MysqlPassword } from '@infrastructure/dbms/mysql/mysql-password';

describe('MysqlPassword', () => {
  it('preserves whitespace because it is part of the credential', () => {
    expect(MysqlPassword.create('  spaced  ').value).toBe('  spaced  ');
  });

  it('accepts the maximum length and rejects one character more', () => {
    expect(MysqlPassword.create('a'.repeat(4096)).value).toHaveLength(4096);
    expect(() => MysqlPassword.create('a'.repeat(4097))).toThrow(
      'Database password must not exceed 4096 characters.',
    );
  });

  it.each([
    ['', 'Database password must not be empty.'],
    ['pass\0word', 'Database password contains an invalid character.'],
  ])('rejects %p', (value, message) => {
    expect(() => MysqlPassword.create(value)).toThrow(message);
    expect(() => MysqlPassword.create(value)).toThrow(ConnectionError);
  });

  it('allows omitted passwords for updates', () => {
    expect(MysqlPassword.createOptional(undefined)).toBeUndefined();
  });

  it('redacts itself from JSON and string coercion', () => {
    const password = MysqlPassword.create('s3cr3t');

    expect(JSON.stringify({ password })).not.toContain('s3cr3t');
    expect(JSON.stringify({ password })).toContain('[REDACTED]');
    expect(String(password)).toBe('[REDACTED]');
  });
});

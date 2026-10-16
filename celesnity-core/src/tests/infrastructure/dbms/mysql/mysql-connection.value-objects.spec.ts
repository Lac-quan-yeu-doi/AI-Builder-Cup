import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import {
  MysqlDatabaseName,
  MysqlDatabaseUsername,
  MysqlSslMode,
  MysqlSslModeValue,
} from '@infrastructure/dbms/mysql/mysql-connection.value-objects';

describe('Mysql connection value objects', () => {
  it.each([
    ['disabled', MysqlSslModeValue.DISABLED],
    [' Preferred ', MysqlSslModeValue.PREFERRED],
    ['REQUIRED', MysqlSslModeValue.REQUIRED],
    ['verify-ca', MysqlSslModeValue.VERIFY_CA],
    ['verify_identity', MysqlSslModeValue.VERIFY_IDENTITY],
  ])('normalizes %s to %s', (input, expected) => {
    expect(MysqlSslMode.create(input).value).toBe(expected);
  });

  it('rejects unsupported TLS modes with a safe validation error', () => {
    expect(() => MysqlSslMode.create('VERIFY_FULL')).toThrow(
      'SSL mode must be one of: DISABLED, PREFERRED, REQUIRED, VERIFY_CA, VERIFY_IDENTITY.',
    );
    expect(() => MysqlSslMode.create('VERIFY_FULL')).toThrow(ConnectionError);
  });

  it('normalizes database names and usernames using the shared text rules', () => {
    expect(MysqlDatabaseName.create(' analytics ').value).toBe('analytics');
    expect(MysqlDatabaseUsername.create(' reader ').value).toBe('reader');
  });

  it('requires non-empty database names and usernames', () => {
    expect(() => MysqlDatabaseName.create('   ')).toThrow('Database name is required.');
    expect(() => MysqlDatabaseUsername.create('   ')).toThrow('Database username is required.');
  });
});

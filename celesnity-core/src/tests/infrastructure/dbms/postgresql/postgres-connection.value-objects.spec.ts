import {
  PostgresSslModeValue,
  isPostgresSslModeValue,
} from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';

describe('PostgreSQL connection value objects', () => {
  it('keeps libpq SSL modes at the PostgreSQL adapter boundary', () => {
    expect(Object.values(PostgresSslModeValue)).toEqual([
      'disable',
      'prefer',
      'require',
      'verify-ca',
      'verify-full',
    ]);
  });

  it.each(Object.values(PostgresSslModeValue))('accepts the SSL mode %s', (member) => {
    expect(isPostgresSslModeValue(member)).toBe(true);
  });
});

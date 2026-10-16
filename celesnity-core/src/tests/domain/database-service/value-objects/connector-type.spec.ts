import { ConnectorType } from '@domain/database-service/value-objects/connector-type';

describe('ConnectorType', () => {
  it.each([
    [' postgresql ', 'POSTGRESQL'],
    ['test_dbms', 'TEST_DBMS'],
  ])('normalizes %p to %p', (value, expected) => {
    expect(ConnectorType.create(value).value).toBe(expected);
  });

  it('compares by normalized value', () => {
    expect(ConnectorType.create('POSTGRESQL').equals(ConnectorType.create('postgresql'))).toBe(
      true,
    );
    expect(ConnectorType.create('POSTGRESQL').equals(ConnectorType.create('MYSQL'))).toBe(false);
  });

  it('rejects a blank database type', () => {
    expect(() => ConnectorType.create('')).toThrow('Database type is required.');
    expect(() => ConnectorType.create('   ')).toThrow('Database type is required.');
  });

  it.each(['A', '1POSTGRESQL', 'mysql-server!', `A${'B'.repeat(50)}`])(
    'rejects invalid database type %p',
    (value) => {
      expect(() => ConnectorType.create(value)).toThrow('Database type is invalid.');
    },
  );

  it('accepts the pattern boundaries', () => {
    expect(ConnectorType.create('AB').value).toBe('AB');
    expect(ConnectorType.create(`A${'B'.repeat(49)}`).value).toHaveLength(50);
  });
});

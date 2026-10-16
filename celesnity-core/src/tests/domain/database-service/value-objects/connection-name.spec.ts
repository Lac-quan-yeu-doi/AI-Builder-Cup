import { ConnectionName } from '@domain/database-service/value-objects/connection-value-objects';
import {
  ConnectionError,
  ConnectionErrorCode,
} from '@domain/database-service/errors/connection.errors';

/**
 * Harness smoke test. Beyond covering ConnectionName, this proves the tsconfig
 * path aliases resolve under Jest and that ConnectionError can be asserted on
 * by code, which every later specification depends on.
 */
describe('ConnectionName', () => {
  it('trims surrounding whitespace', () => {
    expect(ConnectionName.create('  analytics-primary  ').value).toBe('analytics-primary');
  });

  it('accepts a name of exactly 120 characters', () => {
    const name = 'a'.repeat(120);

    expect(ConnectionName.create(name).value).toBe(name);
  });

  it('rejects a name longer than 120 characters', () => {
    expect(() => ConnectionName.create('a'.repeat(121))).toThrow(
      'Connection name must not exceed 120 characters.',
    );
  });

  it('measures length after trimming, so padding does not push a name over the limit', () => {
    const name = 'a'.repeat(120);

    expect(ConnectionName.create(`   ${name}   `).value).toBe(name);
  });

  it('rejects a blank name with a VALIDATION-coded ConnectionError', () => {
    expect.assertions(3);

    try {
      ConnectionName.create('   ');
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectionError);
      expect((error as ConnectionError).code).toBe(ConnectionErrorCode.VALIDATION);
      expect((error as ConnectionError).message).toBe('Connection name is required.');
    }
  });

  it('compares by value', () => {
    expect(ConnectionName.create('warehouse').equals(ConnectionName.create(' warehouse '))).toBe(
      true,
    );
    expect(ConnectionName.create('warehouse').equals(ConnectionName.create('lake'))).toBe(false);
  });
});

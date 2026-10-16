import {
  type JsonObject,
  NormalizedConnectionConfig,
} from '@domain/database-service/value-objects/normalized-connection-config';

const asJsonObject = (value: unknown): JsonObject => value as JsonObject;

describe('NormalizedConnectionConfig', () => {
  it('compares canonical objects independently of key order', () => {
    const first = NormalizedConnectionConfig.create(1, {
      host: 'db.internal',
      options: { applicationName: 'celesnity', ssl: true },
    });
    const second = NormalizedConnectionConfig.create(1, {
      options: { ssl: true, applicationName: 'celesnity' },
      host: 'db.internal',
    });

    expect(first.equals(second)).toBe(true);
  });

  it('canonicalizes nested arrays and objects without changing array order', () => {
    const first = NormalizedConnectionConfig.create(1, {
      routes: [
        { port: 5432, host: 'primary.internal' },
        { host: 'replica.internal', port: 5433 },
      ],
    });
    const reorderedKeys = NormalizedConnectionConfig.create(1, {
      routes: [
        { host: 'primary.internal', port: 5432 },
        { port: 5433, host: 'replica.internal' },
      ],
    });
    const reorderedArray = NormalizedConnectionConfig.create(1, {
      routes: [
        { host: 'replica.internal', port: 5433 },
        { host: 'primary.internal', port: 5432 },
      ],
    });

    expect(first.equals(reorderedKeys)).toBe(true);
    expect(first.equals(reorderedArray)).toBe(false);
  });

  it('includes the schema version in equality', () => {
    const first = NormalizedConnectionConfig.create(1, { host: 'db.internal' });

    expect(first.equals(NormalizedConnectionConfig.create(2, first.toRecord()))).toBe(false);
  });

  it('accepts only positive integer schema versions', () => {
    expect(NormalizedConnectionConfig.create(1, {}).schemaVersion).toBe(1);
    expect(NormalizedConnectionConfig.create(2, {}).schemaVersion).toBe(2);

    for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => NormalizedConnectionConfig.create(version, {})).toThrow(
        'Connection configuration schema version must be a positive integer.',
      );
    }
  });

  it('defensively clones the source object', () => {
    const source = {
      options: { searchPath: ['public'] },
    };
    const config = NormalizedConnectionConfig.create(1, source);

    source.options.searchPath.push('private');

    expect(config.toRecord()).toEqual({ options: { searchPath: ['public'] } });
    expect(
      config.equals(NormalizedConnectionConfig.create(1, { options: { searchPath: ['public'] } })),
    ).toBe(true);
  });

  it('returns a defensive clone that cannot mutate internal equality', () => {
    const config = NormalizedConnectionConfig.create(1, {
      options: { searchPath: ['public'] },
    });
    const returned = config.toRecord() as {
      options: { searchPath: string[] };
    };

    returned.options.searchPath.push('private');

    expect(config.toRecord()).toEqual({ options: { searchPath: ['public'] } });
    expect(
      config.equals(NormalizedConnectionConfig.create(1, { options: { searchPath: ['public'] } })),
    ).toBe(true);
  });

  it.each([
    ['undefined object property', { host: undefined }],
    ['undefined array element', { hosts: ['primary', undefined] }],
    ['Date', { createdAt: new Date('2026-08-06T00:00:00.000Z') }],
    ['function', { transform: (): string => 'value' }],
    ['bigint', { port: BigInt(5432) }],
    ['symbol', { mode: Symbol('mode') }],
  ])('rejects non-JSON value: %s', (_label, value) => {
    expect(() => NormalizedConnectionConfig.create(1, asJsonObject(value))).toThrow(
      'Connection configuration must contain only JSON values.',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite number %p',
    (value) => {
      expect(() => NormalizedConnectionConfig.create(1, asJsonObject({ timeout: value }))).toThrow(
        'Connection configuration must contain only JSON values.',
      );
    },
  );

  it('rejects cyclic objects and arrays', () => {
    const cyclicObject: Record<string, unknown> = {};
    cyclicObject.self = cyclicObject;
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);

    expect(() => NormalizedConnectionConfig.create(1, asJsonObject(cyclicObject))).toThrow(
      'Connection configuration must not contain cycles.',
    );
    expect(() =>
      NormalizedConnectionConfig.create(1, asJsonObject({ value: cyclicArray })),
    ).toThrow('Connection configuration must not contain cycles.');
  });

  it('allows a shared acyclic object to appear more than once', () => {
    const shared = { ssl: true };

    expect(
      NormalizedConnectionConfig.create(1, { primary: shared, replica: shared }).toRecord(),
    ).toEqual({ primary: { ssl: true }, replica: { ssl: true } });
  });
});

import { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import {
  CatalogName,
  ColumnName,
  ColumnType,
  NamespaceName,
  TableName,
  TablePath,
  quoteIdentifier,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';

/**
 * The Catalog Exploration identifier rules.
 *
 * This context has no aggregate — it only reads metadata Trino owns — so these
 * value objects carry its entire domain rule, and it is a security rule: every
 * identifier a caller supplies is composed into SQL, so the allow-list here is
 * what stands between a request parameter and an injected statement.
 *
 * The suite is written from that angle. Most cases are attempts to get a
 * metacharacter past validation, and the quoting helper is tested separately as
 * the second line of defence it is meant to be.
 */

/** The four identifier kinds share one rule, so they share one suite. */
interface ValidatedIdentifier {
  readonly value: string;
}

const FACTORIES: readonly [string, (value: string) => ValidatedIdentifier][] = [
  ['CatalogName', (value: string): ValidatedIdentifier => CatalogName.create(value)],
  ['NamespaceName', (value: string): ValidatedIdentifier => NamespaceName.create(value)],
  ['TableName', (value: string): ValidatedIdentifier => TableName.create(value)],
  ['ColumnName', (value: string): ValidatedIdentifier => ColumnName.create(value)],
];

describe.each(FACTORIES)('%s', (_name, create) => {
  it.each(['orders', 'ORDERS', 'orders_2026', '_private', 'a', '0'])(
    'accepts the safe identifier %j',
    (value) => {
      expect(create(value).value).toBe(value);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(create('  orders  ').value).toBe('orders');
  });

  it('accepts an identifier of exactly the maximum length', () => {
    expect(create('a'.repeat(255)).value).toHaveLength(255);
  });

  it('rejects an identifier one character too long', () => {
    expect(() => create('a'.repeat(256))).toThrow(CatalogError);
  });

  it.each(['', '   ', '\t\n'])('rejects blank input %j', (value) => {
    expect(() => create(value)).toThrow(CatalogError);
  });

  // Every one of these would change the meaning of a composed statement.
  it.each([
    ['a semicolon', 'orders; DROP TABLE x'],
    ['a double quote', 'ord"ers'],
    ['a single quote', "ord'ers"],
    ['a backtick', 'ord`ers'],
    ['a dot', 'schema.orders'],
    ['a space', 'my orders'],
    ['a hyphen', 'my-orders'],
    ['a comment marker', 'orders--'],
    ['a block comment', 'orders/*x*/'],
    ['a dollar sign', 'orders$snapshots'],
    ['parentheses', 'orders()'],
    ['a comma', 'orders,x'],
    ['a star', 'orders*'],
    ['a NUL byte', 'orders\0'],
    ['a newline', 'orders\nDROP TABLE x'],
    ['a non-ASCII letter', 'ordres_é'],
    ['a percent sign', 'orders%'],
    ['a backslash', 'orders\\'],
  ])('rejects %s', (_label, value) => {
    expect(() => create(value)).toThrow(CatalogError);
  });
});

describe('quoteIdentifier', () => {
  it('wraps the identifier in double quotes', () => {
    expect(quoteIdentifier('orders')).toBe('"orders"');
  });

  it('doubles an embedded double quote, which is how SQL escapes it', () => {
    // Validation should already have rejected this. The helper still handles it,
    // because defence in depth means the second layer does not assume the first ran.
    expect(quoteIdentifier('ord"ers')).toBe('"ord""ers"');
  });

  it('doubles every embedded quote, not only the first', () => {
    expect(quoteIdentifier('a"b"c')).toBe('"a""b""c"');
  });
});

describe('TablePath', () => {
  it('renders a fully qualified, individually quoted path', () => {
    const path = TablePath.create('iceberg', 'main', 'orders');

    expect(path.toQualifiedSql()).toBe('"iceberg"."main"."orders"');
  });

  it('rejects the whole path when any component is unsafe', () => {
    expect(() => TablePath.create('iceberg', 'main', 'orders; DROP TABLE x')).toThrow(CatalogError);
    expect(() => TablePath.create('iceberg', 'ma in', 'orders')).toThrow(CatalogError);
    expect(() => TablePath.create('ice.berg', 'main', 'orders')).toThrow(CatalogError);
  });

  it('renders an Iceberg metadata table as one quoted token', () => {
    const path = TablePath.create('iceberg', 'main', 'orders');

    // The `$` lives inside the quotes, so it is part of the identifier rather
    // than syntax the engine could interpret.
    expect(path.toMetadataTableSql('snapshots')).toBe('"iceberg"."main"."orders$snapshots"');
  });

  it.each(['Snapshots', 'snap_shots', 'snapshots1', '', 'snap shots', 'snapshots"'])(
    'rejects the unsafe metadata suffix %j',
    (suffix) => {
      const path = TablePath.create('iceberg', 'main', 'orders');

      expect(() => path.toMetadataTableSql(suffix)).toThrow(CatalogError);
    },
  );

  it('exposes its components as validated identifiers', () => {
    const path = TablePath.create('iceberg', 'main', 'orders');

    expect(path.catalog.value).toBe('iceberg');
    expect(path.schema.value).toBe('main');
    expect(path.table.value).toBe('orders');
  });
});

describe('ColumnType', () => {
  it('accepts a Trino type expression, which may contain punctuation', () => {
    // Types come from Trino metadata and are never interpolated into SQL, so the
    // strict identifier rule would be wrong here.
    expect(ColumnType.create('varchar(255)').value).toBe('varchar(255)');
    expect(ColumnType.create('row(a integer, b varchar)').value).toBe('row(a integer, b varchar)');
    expect(ColumnType.create('decimal(10,2)').value).toBe('decimal(10,2)');
  });

  it('trims surrounding whitespace', () => {
    expect(ColumnType.create('  integer  ').value).toBe('integer');
  });

  it('rejects a blank type', () => {
    expect(() => ColumnType.create('   ')).toThrow(CatalogError);
  });

  it('rejects a NUL byte, which could truncate the value downstream', () => {
    expect(() => ColumnType.create('varchar\0')).toThrow(CatalogError);
  });

  it('rejects a pathologically large type', () => {
    expect(() => ColumnType.create('a'.repeat(65_536))).toThrow(CatalogError);
  });

  it('compares by value', () => {
    expect(ColumnType.create('integer').equals(ColumnType.create('integer'))).toBe(true);
    expect(ColumnType.create('integer').equals(ColumnType.create('bigint'))).toBe(false);
  });
});

describe('catalog identifier equality', () => {
  it('compares by value', () => {
    expect(CatalogName.create('iceberg').equals(CatalogName.create('iceberg'))).toBe(true);
    expect(CatalogName.create('iceberg').equals(CatalogName.create('hive'))).toBe(false);
  });

  it('renders its own value when stringified', () => {
    expect(TableName.create('orders').toString()).toBe('orders');
  });

  it('exposes a pre-quoted form for SQL composition', () => {
    expect(TableName.create('orders').quoted).toBe('"orders"');
  });
});

import { TrinoQueryTargetResolver } from '@infrastructure/trino/query-workbench/trino-query-target.resolver';
import {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

describe('Trino query target resolution', () => {
  const resolver = new TrinoQueryTargetResolver();
  const context = QueryContext.create('iceberg', 'analytics');
  const resolve = (sql: string) => resolver.resolve(SqlStatement.create(sql), context);
  const target = (table: string, schema = 'analytics', catalog = 'iceberg') => ({
    catalog,
    schema,
    table,
  });

  it.each(['SELECT 1', 'SELECT current_user', "VALUES ('system.runtime.nodes')"])(
    'has no table targets for %s',
    (sql) => expect(resolve(sql)).toEqual([]),
  );
  it.each([
    ['SELECT * FROM events', [target('events')]],
    ['TABLE events', [target('events')]],
    ['SELECT * FROM "112121"', [target('112121')]],
    ['SELECT * FROM staging.events', [target('events', 'staging')]],
    ['SELECT * FROM system.runtime.nodes', [target('nodes', 'runtime', 'system')]],
    ['SELECT * FROM "SYSTEM" . "runtime" . "nodes"', [target('nodes', 'runtime', 'system')]],
    ['SELECT * FROM events a JOIN denied b ON a.id = b.id', [target('events'), target('denied')]],
    ['SELECT * FROM events a, staging.denied b WHERE a.id = b.id', [target('events'), target('denied', 'staging')]],
    ['TABLE "staging"."denied"', [target('denied', 'staging')]],
    [
      'SELECT b.name, COUNT(DISTINCT o.id), SUM(TRY_CAST(oi.count_out AS BIGINT)) FROM iceberg.kasadata.brands b JOIN iceberg.kasadata.orders o ON o.brand_id = b.id LEFT JOIN iceberg.kasadata.order_items oi ON oi.order_id = o.id GROUP BY b.name',
      [
        target('brands', 'kasadata'),
        target('orders', 'kasadata'),
        target('order_items', 'kasadata'),
      ],
    ],
    ['SELECT (SELECT count(*) FROM denied) FROM events', [target('denied'), target('events')]],
    [
      'SELECT * FROM events WHERE EXISTS (SELECT 1 FROM denied)',
      [target('events'), target('denied')],
    ],
    ['WITH n AS (SELECT * FROM denied) SELECT * FROM n', [target('denied')]],
    ['WITH n AS (SELECT * FROM denied) SELECT 1', [target('denied')]],
    [
      'WITH n AS (SELECT * FROM denied), m AS (SELECT * FROM n) SELECT * FROM m',
      [target('denied')],
    ],
    ['WITH n AS (SELECT * FROM n) SELECT * FROM n', [target('n')]],
    ['WITH events AS (SELECT 1) SELECT * FROM analytics.events', [target('events')]],
    ['SELECT * FROM (WITH n AS (SELECT 1) SELECT * FROM n) x JOIN n y ON true', [target('n')]],
    ['SELECT * FROM events UNION ALL SELECT * FROM denied', [target('events'), target('denied')]],
    ["SELECT 'FROM denied' FROM events -- JOIN hidden\n", [target('events')]],
    ['SELECT * FROM events WHERE is_deleted IS NOT TRUE', [target('events')]],
    ['SELECT * FROM events WHERE is_deleted IS TRUE', [target('events')]],
  ] as const)('resolves %s', (sql, expected) => expect(resolve(sql)).toEqual(expected));

  it.each([
    'DROP TABLE iceberg.analytics.orders',
    'DELETE FROM iceberg.analytics.orders',
    'INSERT INTO iceberg.analytics.orders SELECT * FROM iceberg.analytics.source',
    'SELECT * FROM events; SELECT * FROM denied',
    "SELECT * FROM TABLE(system.query(query => 'SELECT * FROM denied'))",
    'WITH RECURSIVE n AS (SELECT * FROM denied) SELECT * FROM n',
    'SELECT iceberg.analytics.secret_function()',
    'SHOW TABLES FROM analytics',
    'DESCRIBE denied',
    'EXPLAIN SELECT * FROM denied',
    "WITH SESSION query_max_execution_time = '2h' SELECT 1",
    'SELECT * FROM "events$partitions"',
    'SELECT * FROM "analytics.denied"',
    'SELECT * FROM',
  ])('fails closed for %s', (sql) => expect(() => resolve(sql)).toThrow());

  it('rejects unqualified tables when no database context exists', () => {
    expect(() =>
      resolver.resolve(
        SqlStatement.create('SELECT * FROM events'),
        QueryContext.create('iceberg', null),
      ),
    ).toThrow();
  });
});

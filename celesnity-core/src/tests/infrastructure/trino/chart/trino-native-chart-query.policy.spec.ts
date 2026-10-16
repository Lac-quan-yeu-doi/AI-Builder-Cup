import { TrinoNativeChartQueryPolicy } from '@infrastructure/trino/chart/trino-native-chart-query.policy';

describe('TrinoNativeChartQueryPolicy', () => {
  it('accepts a read-only Trino aggregate that uses TRY_CAST', async () => {
    const policy = new TrinoNativeChartQueryPolicy();

    await expect(
      policy.validateAndCompile(
        'SELECT b.name, COUNT(DISTINCT o.id) AS total_orders, SUM(TRY_CAST(oi.count_out AS BIGINT)) AS total_items FROM iceberg.kasadata.brands b JOIN iceberg.kasadata.orders o ON o.brand_id = b.id LEFT JOIN iceberg.kasadata.order_items oi ON oi.order_id = o.id GROUP BY b.name',
        { catalog: 'iceberg', schema: 'kasadata' },
      ),
    ).resolves.toMatchObject({
      relations: [
        { catalog: 'iceberg', schema: 'kasadata', table: 'brands' },
        { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        { catalog: 'iceberg', schema: 'kasadata', table: 'order_items' },
      ],
    });
  });

  it('rejects a second destructive statement', async () => {
    const policy = new TrinoNativeChartQueryPolicy();
    await expect(
      policy.validateAndCompile('SELECT * FROM iceberg.analytics.orders; DROP TABLE x', {
        catalog: 'iceberg',
        schema: 'analytics',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_STATEMENT_FORBIDDEN' });
  });

  it('rejects a write hidden inside a CTE', async () => {
    const policy = new TrinoNativeChartQueryPolicy();
    await expect(
      policy.validateAndCompile(
        'WITH deleted AS (DELETE FROM iceberg.analytics.orders RETURNING id) SELECT * FROM deleted',
        { catalog: 'iceberg', schema: 'analytics' },
      ),
    ).rejects.toMatchObject({ code: 'QUERY_STATEMENT_FORBIDDEN' });
  });
});

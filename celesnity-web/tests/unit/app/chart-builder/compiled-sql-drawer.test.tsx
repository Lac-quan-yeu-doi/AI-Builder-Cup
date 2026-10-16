// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { CompiledSqlDrawer } from '@/app/(workspace)/charts/_components/native-query/compiled-sql-drawer';
import { makeVisualQuery } from './chart-builder-test-fixtures';

afterEach(cleanup);

describe('CompiledSqlDrawer', () => {
  it('shows Core SQL and converts a visual question to native SQL explicitly', async () => {
    const visualQuery = makeVisualQuery();
    const coreCompiledSql =
      'SELECT "status", COUNT("id") AS "order_count" FROM iceberg.analytics.orders';
    const compileQuery = vi.fn().mockResolvedValue({
      mode: 'VISUAL',
      context: visualQuery.context,
      sql: coreCompiledSql,
    });
    const onConvert = vi.fn();

    renderUi(
      <CompiledSqlDrawer
        visualQuery={visualQuery}
        parameterValues={{}}
        compileQuery={compileQuery}
        onConvert={onConvert}
      />,
    );

    await fireEvent.click(screen.getByRole('button', { name: /view sql/i }));
    expect(compileQuery).toHaveBeenCalledWith({
      queryDefinition: visualQuery,
      parameterValues: {},
    });
    expect(await screen.findByText(coreCompiledSql)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /convert this question to sql/i }));
    await waitFor(() =>
      expect(onConvert).toHaveBeenCalledWith({
        schemaVersion: 1,
        mode: 'NATIVE',
        context: visualQuery.context,
        parameters: visualQuery.parameters,
        sql: coreCompiledSql,
      }),
    );
  });
});

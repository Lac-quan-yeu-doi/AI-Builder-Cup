import { createHash } from 'node:crypto';

import type { INativeChartQueryPolicy } from '@application/chart/interfaces/i-native-chart-query-policy';
import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import { renderParameters } from '@application/chart/query/parameter.renderer';
import { TrinoQueryTargetResolver } from '@infrastructure/trino/query-workbench/trino-query-target.resolver';
import { ChartError } from '@domain/chart/errors/chart.errors';
import type { QueryContext, QueryParameter } from '@domain/chart/models/query-definition';
import {
  QueryContext as WorkbenchQueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

export class TrinoNativeChartQueryPolicy implements INativeChartQueryPolicy {
  private readonly targets = new TrinoQueryTargetResolver();

  public async validateAndCompile(
    sql: string,
    context: QueryContext,
    parameters: readonly QueryParameter[] = [],
    values: Readonly<Record<string, unknown>> = {},
  ): Promise<CompiledChartQuery> {
    await Promise.resolve();
    const rendered = renderParameters(sql, parameters, values);
    const normalized = rendered.trim().replace(/;\s*$/u, '');
    let relations: readonly { catalog: string; schema: string; table: string }[];
    try {
      relations = this.targets.resolve(
        SqlStatement.create(normalized),
        WorkbenchQueryContext.create(context.catalog, context.schema),
      );
    } catch {
      throw ChartError.statementForbidden('The SQL relation set could not be authorized.');
    }
    return {
      sql: `SELECT * FROM (${normalized}) AS "chart_query" LIMIT 10000`,
      context,
      queryHash: createHash('sha256').update(normalized).digest('hex'),
      relations: relations.map((relation) => ({
        catalog: relation.catalog,
        schema: relation.schema,
        table: relation.table,
      })),
      outputAliases: [],
    };
  }
}

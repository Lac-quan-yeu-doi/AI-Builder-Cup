import { createHash } from 'node:crypto';

import {
  compileExpression,
  compileOperator,
  quote,
} from '@application/chart/query/expression.compiler';
import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import type { Expression } from '@domain/chart/models/expression';
import {
  MAX_VISUAL_QUERY_ROWS,
  validateQueryDefinition,
  type NamedExpression,
  type TableRef,
  type VisualQueryDefinition,
} from '@domain/chart/models/query-definition';

/** Compiles the UI query-builder IR into deterministic, read-only Trino SQL. */
export class VisualQueryCompiler {
  public compile(definition: VisualQueryDefinition): CompiledChartQuery {
    validateQueryDefinition(definition);
    const source = `${table(definition.source.table)} AS ${quote(definition.source.alias)}`;
    const joins = definition.joins
      .map(
        (join) =>
          `${join.type} JOIN ${table(join.table)} AS ${quote(join.alias)} ON ${join.conditions
            .map(
              (condition) =>
                `${compileExpression(condition.left)} ${compileOperator(condition.operator)} ${compileExpression(condition.right)}`,
            )
            .join(' AND ')}`,
      )
      .join(' ');

    const outputAliases: string[] = [];
    const selections: string[] = [];
    const addNamed = (item: NamedExpression, aggregate?: string): void => {
      const expression = aggregate
        ? `${aggregate.toUpperCase()}(${compileExpression(item.expression)})`
        : compileExpression(item.expression);
      selections.push(`${expression} AS ${quote(item.alias)}`);
      outputAliases.push(item.alias);
    };
    definition.projections.forEach((item) => addNamed(item));
    definition.customExpressions.forEach((item) => addNamed(item));
    definition.aggregations.forEach((item) => addNamed(item, item.function));
    definition.breakouts.forEach((expression, index) => {
      const alias = `breakout_${index + 1}`;
      selections.push(`${compileExpression(expression)} AS ${quote(alias)}`);
      outputAliases.push(alias);
    });
    if (selections.length === 0) selections.push('*');

    const where = conjunction(definition.filters);
    const having = conjunction(definition.postAggregationFilters);
    const groupBy = definition.breakouts.length
      ? ` GROUP BY ${definition.breakouts.map(compileExpression).join(', ')}`
      : '';
    const orderBy = definition.orderBy.length
      ? ` ORDER BY ${definition.orderBy
          .map((item) => `${compileExpression(item.expression)} ${item.direction}`)
          .join(', ')}`
      : '';
    const sql = [
      `SELECT ${selections.join(', ')} FROM ${source}`,
      joins,
      where ? `WHERE ${where}` : '',
      groupBy,
      having ? `HAVING ${having}` : '',
      orderBy,
      `LIMIT ${definition.limit ?? MAX_VISUAL_QUERY_ROWS}`,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      sql,
      context: definition.context,
      queryHash: createHash('sha256').update(sql).digest('hex'),
      relations: [definition.source.table, ...definition.joins.map((join) => join.table)],
      outputAliases,
    };
  }
}

function conjunction(expressions: readonly Expression[]): string {
  return expressions.map(compileExpression).join(' AND ');
}

function table(value: TableRef): string {
  return `${quote(value.catalog)}.${quote(value.schema)}.${quote(value.table)}`;
}

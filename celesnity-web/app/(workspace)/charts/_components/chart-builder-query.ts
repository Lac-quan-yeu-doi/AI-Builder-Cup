import type { QueryExpression, VisualQueryDefinition } from '@/src/entities/models/canonical-chart';

/**
 * HAVING must reference the aggregate expression, not the SELECT alias as a
 * source column. A raw relation.field remains supported for advanced users.
 */
export function resolvePostAggregationFilterExpression(
  query: VisualQueryDefinition,
  input: string,
  fallbackRelation: string,
): QueryExpression {
  const normalized = input.trim();
  const aggregation = query.aggregations.find((item) => item.alias === normalized);
  if (aggregation) {
    return {
      kind: 'CALL',
      function: aggregation.function,
      arguments: [aggregation.expression],
    };
  }

  const [first = '', ...rest] = normalized.split('.');
  return {
    kind: 'FIELD',
    relation: rest.length > 0 ? first : fallbackRelation,
    field: rest.length > 0 ? rest.join('.') : first,
  };
}

/** Human-readable expression label used by notebook chips and filter summaries. */
export function expressionText(expression: QueryExpression): string {
  switch (expression.kind) {
    case 'FIELD':
      return `${expression.relation}.${expression.field}`;
    case 'LITERAL':
      return expression.value === null ? 'NULL' : JSON.stringify(expression.value);
    case 'CALL':
      return `${expression.function}(${expression.arguments.map(expressionText).join(', ')})`;
    case 'UNARY':
      return `${expression.operator} ${expressionText(expression.operand)}`;
    case 'BINARY':
      return `(${expressionText(expression.left)} ${expression.operator} ${expressionText(expression.right)})`;
    case 'CASE':
      return `CASE ${expression.branches
        .map((branch) => `WHEN ${expressionText(branch.when)} THEN ${expressionText(branch.then)}`)
        .join(' ')} ELSE ${expressionText(expression.otherwise)} END`;
  }
}

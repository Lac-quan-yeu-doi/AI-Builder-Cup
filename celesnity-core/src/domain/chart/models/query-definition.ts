import { ChartError } from '@domain/chart/errors/chart.errors';
import type { Expression } from '@domain/chart/models/expression';

export interface TableRef {
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
}

export interface QueryContext {
  readonly catalog: string;
  readonly schema: string;
}

export type QueryParameterType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';

export interface QueryParameter {
  readonly name: string;
  readonly type: QueryParameterType;
  readonly required: boolean;
}

export interface NamedExpression {
  readonly alias: string;
  readonly expression: Expression;
}

export interface VisualJoin {
  readonly type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  readonly table: TableRef;
  readonly alias: string;
  readonly conditions: readonly {
    readonly left: Expression;
    readonly operator: 'EQ' | 'NOT_EQ' | 'GT' | 'GTE' | 'LT' | 'LTE';
    readonly right: Expression;
  }[];
}

export interface VisualQueryDefinition {
  readonly schemaVersion: 1;
  readonly mode: 'VISUAL';
  readonly context: QueryContext;
  readonly parameters: readonly QueryParameter[];
  readonly source: { readonly table: TableRef; readonly alias: string };
  readonly joins: readonly VisualJoin[];
  readonly projections: readonly NamedExpression[];
  readonly customExpressions: readonly NamedExpression[];
  readonly filters: readonly Expression[];
  readonly aggregations: readonly (NamedExpression & { readonly function: string })[];
  readonly breakouts: readonly Expression[];
  readonly postAggregationFilters: readonly Expression[];
  readonly orderBy: readonly {
    readonly expression: Expression;
    readonly direction: 'ASC' | 'DESC';
  }[];
  readonly limit?: number;
}

export interface NativeQueryDefinition {
  readonly schemaVersion: 1;
  readonly mode: 'NATIVE';
  readonly context: QueryContext;
  readonly parameters: readonly QueryParameter[];
  readonly sql: string;
}

export type QueryDefinition = VisualQueryDefinition | NativeQueryDefinition;

const MAX_ITEMS = 100;
const MAX_EXPRESSION_DEPTH = 20;
export const MAX_VISUAL_QUERY_ROWS = 10_000;

export function validateQueryDefinition(definition: QueryDefinition): void {
  if (definition.schemaVersion !== 1) {
    throw ChartError.queryInvalid('Only schema version 1 is supported.');
  }
  validateContext(definition.context);
  validateParameters(definition.parameters);
  if (definition.mode === 'NATIVE') {
    if (definition.sql.trim().length === 0) {
      throw ChartError.queryInvalid('Native SQL must not be blank.');
    }
    return;
  }
  validateVisualDefinition(definition);
}

function validateVisualDefinition(definition: VisualQueryDefinition): void {
  if (
    definition.limit !== undefined &&
    (!Number.isInteger(definition.limit) ||
      definition.limit < 1 ||
      definition.limit > MAX_VISUAL_QUERY_ROWS)
  ) {
    throw ChartError.queryInvalid(
      `Visual query limit must be an integer between 1 and ${MAX_VISUAL_QUERY_ROWS}.`,
    );
  }
  validateTable(definition.source.table);
  assertPhysicalIdentifier(definition.source.alias, 'Source alias');
  assertCount(definition.joins, 'joins');
  const relationAliases = new Set<string>([definition.source.alias]);
  for (const join of definition.joins) {
    validateTable(join.table);
    assertPhysicalIdentifier(join.alias, 'Join alias');
    if (relationAliases.has(join.alias)) {
      throw ChartError.queryInvalid(`Relation alias ${join.alias} is duplicated.`);
    }
    relationAliases.add(join.alias);
    if (join.conditions.length === 0) {
      throw ChartError.queryInvalid(`Join ${join.alias} needs at least one condition.`);
    }
  }
  const outputAliases = new Set<string>();
  for (const group of [
    definition.projections,
    definition.customExpressions,
    definition.aggregations,
  ]) {
    assertCount(group, 'output expressions');
    for (const item of group) {
      assertPhysicalIdentifier(item.alias, 'Output alias');
      if (outputAliases.has(item.alias)) {
        throw ChartError.queryInvalid(`Output alias ${item.alias} is duplicated.`);
      }
      outputAliases.add(item.alias);
      validateExpression(item.expression, relationAliases, 0);
    }
  }
  for (const join of definition.joins) {
    for (const condition of join.conditions) {
      validateExpression(condition.left, relationAliases, 0);
      validateExpression(condition.right, relationAliases, 0);
    }
  }
  for (const expression of [
    ...definition.filters,
    ...definition.breakouts,
    ...definition.postAggregationFilters,
    ...definition.orderBy.map((item) => item.expression),
  ]) {
    validateExpression(expression, relationAliases, 0);
  }
}

function validateParameters(parameters: readonly QueryParameter[]): void {
  assertCount(parameters, 'parameters');
  const names = new Set<string>();
  for (const parameter of parameters) {
    assertIdentifier(parameter.name, 'Parameter name');
    if (names.has(parameter.name)) {
      throw ChartError.queryInvalid(`Parameter ${parameter.name} is duplicated.`);
    }
    names.add(parameter.name);
  }
}

function validateContext(context: QueryContext): void {
  assertPhysicalIdentifier(context.catalog, 'Catalog');
  assertPhysicalIdentifier(context.schema, 'Schema');
}

function validateTable(table: TableRef): void {
  assertPhysicalIdentifier(table.catalog, 'Catalog');
  assertPhysicalIdentifier(table.schema, 'Schema');
  assertPhysicalIdentifier(table.table, 'Table');
}

function validateExpression(
  expression: Expression,
  relationAliases: ReadonlySet<string>,
  depth: number,
): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw ChartError.queryInvalid('Expression nesting exceeds the supported depth.');
  }
  switch (expression.kind) {
    case 'FIELD':
      assertPhysicalIdentifier(expression.relation, 'Field relation');
      assertPhysicalIdentifier(expression.field, 'Field name');
      if (!relationAliases.has(expression.relation)) {
        throw ChartError.queryInvalid(`Field relation ${expression.relation} is not declared.`);
      }
      return;
    case 'LITERAL':
      validateLiteral(expression);
      return;
    case 'BINARY':
      if (
        (expression.operator === 'EQ' || expression.operator === 'NOT_EQ') &&
        (isNullLiteral(expression.left) || isNullLiteral(expression.right))
      ) {
        throw ChartError.queryInvalid(
          'NULL cannot be compared with EQ or NOT_EQ. Use NOT COALESCE(field, FALSE) for nullable false semantics.',
        );
      }
      validateExpression(expression.left, relationAliases, depth + 1);
      validateExpression(expression.right, relationAliases, depth + 1);
      return;
    case 'UNARY':
      validateExpression(expression.operand, relationAliases, depth + 1);
      return;
    case 'CALL':
      assertIdentifier(expression.function, 'Function name');
      assertCount(expression.arguments, 'Function arguments');
      expression.arguments.forEach((argument) =>
        validateExpression(argument, relationAliases, depth + 1),
      );
      return;
    case 'CASE':
      assertCount(expression.branches, 'CASE branches');
      expression.branches.forEach((branch) => {
        validateExpression(branch.when, relationAliases, depth + 1);
        validateExpression(branch.then, relationAliases, depth + 1);
      });
      validateExpression(expression.otherwise, relationAliases, depth + 1);
      return;
  }
}

function isNullLiteral(expression: Expression): boolean {
  return expression.kind === 'LITERAL' && expression.valueType === 'NULL';
}

function validateLiteral(expression: Extract<Expression, { readonly kind: 'LITERAL' }>): void {
  if (expression.valueType === 'NULL' && expression.value !== null) {
    throw ChartError.queryInvalid('NULL literals must have a null value.');
  }
  if (expression.valueType === 'NUMBER' && typeof expression.value !== 'number') {
    throw ChartError.queryInvalid('NUMBER literals must have a number value.');
  }
  if (expression.valueType === 'BOOLEAN' && typeof expression.value !== 'boolean') {
    throw ChartError.queryInvalid('BOOLEAN literals must have a boolean value.');
  }
  if (
    (expression.valueType === 'STRING' || expression.valueType === 'DATE') &&
    typeof expression.value !== 'string'
  ) {
    throw ChartError.queryInvalid(`${expression.valueType} literals must have a string value.`);
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw ChartError.queryInvalid(`${label} is invalid.`);
  }
}

/**
 * Physical catalog identifiers are emitted only through the compiler's quoted
 * identifier path. Keep their accepted shape aligned with catalog exploration,
 * including names that begin with a digit, while rejecting delimiters and
 * control characters that do not belong to the supported catalog contract.
 */
function assertPhysicalIdentifier(value: string, label: string): void {
  if (value.length > 255 || !/^[A-Za-z0-9_]+$/.test(value)) {
    throw ChartError.queryInvalid(`${label} is invalid.`);
  }
}

function assertCount(items: readonly unknown[], label: string): void {
  if (items.length > MAX_ITEMS) {
    throw ChartError.queryInvalid(`Too many ${label}.`);
  }
}

import type { Expression } from '@domain/chart/models/expression';

export function compileExpression(expression: Expression): string {
  switch (expression.kind) {
    case 'FIELD':
      return `${quote(expression.relation)}.${quote(expression.field)}`;
    case 'LITERAL': {
      if (expression.value === null) return 'NULL';
      if (expression.valueType === 'DATE') {
        return `DATE '${String(expression.value).replaceAll("'", "''")}'`;
      }
      if (expression.valueType === 'BOOLEAN') return expression.value ? 'TRUE' : 'FALSE';
      return typeof expression.value === 'number'
        ? String(expression.value)
        : `'${String(expression.value).replaceAll("'", "''")}'`;
    }
    case 'BINARY':
      return `(${compileExpression(expression.left)} ${compileOperator(expression.operator)} ${compileExpression(expression.right)})`;
    case 'UNARY':
      return expression.operator === 'NOT'
        ? `(NOT ${compileExpression(expression.operand)})`
        : `(-${compileExpression(expression.operand)})`;
    case 'CALL':
      // Function names are validated as identifiers at the query boundary, so
      // emitting them bare preserves SQL function resolution while keeping
      // arguments quoted/escaped through the recursive compiler.
      return `${expression.function}(${expression.arguments.map(compileExpression).join(', ')})`;
    case 'CASE':
      return `CASE ${expression.branches.map((branch) => `WHEN ${compileExpression(branch.when)} THEN ${compileExpression(branch.then)}`).join(' ')} ELSE ${compileExpression(expression.otherwise)} END`;
  }
}

export function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function compileOperator(value: string): string {
  return (
    (
      {
        ADD: '+',
        SUBTRACT: '-',
        MULTIPLY: '*',
        DIVIDE: '/',
        EQ: '=',
        NOT_EQ: '<>',
        GT: '>',
        GTE: '>=',
        LT: '<',
        LTE: '<=',
        AND: 'AND',
        OR: 'OR',
      } as Readonly<Record<string, string>>
    )[value] ?? value
  );
}

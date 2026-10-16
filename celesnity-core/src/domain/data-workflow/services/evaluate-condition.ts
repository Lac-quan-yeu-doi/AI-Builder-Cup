import type {
  Condition,
  ConditionContext,
  Scalar,
} from '@domain/data-workflow/models/workflow-graph';

const MAX_EXPRESSION_DEPTH = 32;
const MAX_EXPRESSION_NODES = 128;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export type ConditionEvaluationErrorCode =
  | 'MISSING_FIELD'
  | 'INVALID_COMPARISON'
  | 'EMPTY_EXPRESSION'
  | 'FORBIDDEN_PATH_SEGMENT'
  | 'EXPRESSION_LIMIT_EXCEEDED';

export class ConditionEvaluationError extends Error {
  public constructor(public readonly code: ConditionEvaluationErrorCode) {
    super(code);
    this.name = ConditionEvaluationError.name;
  }
}

function validateExpression(condition: Condition, depth: number, count: { value: number }): void {
  count.value += 1;
  if (depth > MAX_EXPRESSION_DEPTH || count.value > MAX_EXPRESSION_NODES) {
    throw new ConditionEvaluationError('EXPRESSION_LIMIT_EXCEEDED');
  }

  if ('conditions' in condition) {
    if (condition.conditions.length === 0) {
      throw new ConditionEvaluationError('EMPTY_EXPRESSION');
    }
    for (const nested of condition.conditions) {
      validateExpression(nested, depth + 1, count);
    }
    return;
  }

  if (condition.path.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    throw new ConditionEvaluationError('FORBIDDEN_PATH_SEGMENT');
  }
}

function isConditionContext(value: Scalar | ConditionContext): value is ConditionContext {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readScalar(path: readonly string[], context: ConditionContext): Scalar {
  let current: Scalar | ConditionContext = context;

  for (const segment of path) {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new ConditionEvaluationError('FORBIDDEN_PATH_SEGMENT');
    }
    if (!isConditionContext(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new ConditionEvaluationError('MISSING_FIELD');
    }
    const next: Scalar | ConditionContext | undefined = current[segment];
    if (next === undefined) {
      throw new ConditionEvaluationError('MISSING_FIELD');
    }
    current = next;
  }

  if (isConditionContext(current)) {
    throw new ConditionEvaluationError('INVALID_COMPARISON');
  }
  return current;
}

function compare(
  condition: Exclude<Condition, { readonly op: 'all' | 'any' }>,
  actual: Scalar,
): boolean {
  const expected = condition.value;
  if (
    condition.op === 'gt' ||
    condition.op === 'gte' ||
    condition.op === 'lt' ||
    condition.op === 'lte'
  ) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new ConditionEvaluationError('INVALID_COMPARISON');
    }
    switch (condition.op) {
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
    }
  }

  if (typeof actual !== typeof expected || (actual === null) !== (expected === null)) {
    throw new ConditionEvaluationError('INVALID_COMPARISON');
  }
  return condition.op === 'eq' ? actual === expected : actual !== expected;
}

function evaluate(condition: Condition, context: ConditionContext): boolean {
  if ('conditions' in condition) {
    return condition.op === 'all'
      ? condition.conditions.every((nested) => evaluate(nested, context))
      : condition.conditions.some((nested) => evaluate(nested, context));
  }
  return compare(condition, readScalar(condition.path, context));
}

export function evaluateCondition(condition: Condition, context: ConditionContext): boolean {
  validateExpression(condition, 1, { value: 0 });
  return evaluate(condition, context);
}

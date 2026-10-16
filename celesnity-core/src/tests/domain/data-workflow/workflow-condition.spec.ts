import type { Condition, ConditionContext } from '@domain/data-workflow/models/workflow-graph';
import {
  ConditionEvaluationError,
  evaluateCondition,
} from '@domain/data-workflow/services/evaluate-condition';

const context: ConditionContext = {
  extract: {
    attempts: 3,
    enabled: true,
    status: 'accepted',
  },
};

describe('evaluateCondition', () => {
  it('evaluates nested all and any expressions against scalar leaves', () => {
    const condition: Condition = {
      op: 'all',
      conditions: [
        { op: 'eq', path: ['extract', 'status'], value: 'accepted' },
        {
          op: 'any',
          conditions: [
            { op: 'gt', path: ['extract', 'attempts'], value: 2 },
            { op: 'eq', path: ['extract', 'enabled'], value: false },
          ],
        },
      ],
    };

    expect(evaluateCondition(condition, context)).toBe(true);
  });

  it('does not coerce values when testing equality', () => {
    const condition: Condition = { op: 'eq', path: ['extract', 'attempts'], value: '3' };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('INVALID_COMPARISON'),
    );
  });

  it('raises a typed error for a missing field', () => {
    const condition: Condition = { op: 'eq', path: ['extract', 'missing'], value: 'accepted' };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('MISSING_FIELD'),
    );
  });

  it('raises a typed error when a relational comparison uses a non-number', () => {
    const condition: Condition = { op: 'gte', path: ['extract', 'status'], value: 'accepted' };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('INVALID_COMPARISON'),
    );
  });

  it.each(['all', 'any'] as const)('rejects an empty %s expression', (op) => {
    const condition: Condition = { op, conditions: [] };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('EMPTY_EXPRESSION'),
    );
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the %s path segment', (segment) => {
    const condition: Condition = { op: 'eq', path: ['extract', segment], value: 'accepted' };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('FORBIDDEN_PATH_SEGMENT'),
    );
  });

  it('rejects expressions deeper than the domain limit', () => {
    let condition: Condition = { op: 'eq', path: ['extract', 'enabled'], value: true };
    for (let index = 0; index < 33; index += 1) {
      condition = { op: 'all', conditions: [condition] };
    }

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('EXPRESSION_LIMIT_EXCEEDED'),
    );
  });

  it('rejects expressions with more nodes than the domain limit', () => {
    const condition: Condition = {
      op: 'all',
      conditions: Array.from({ length: 129 }, () => ({
        op: 'eq' as const,
        path: ['extract', 'enabled'],
        value: true,
      })),
    };

    expect(() => evaluateCondition(condition, context)).toThrow(
      new ConditionEvaluationError('EXPRESSION_LIMIT_EXCEEDED'),
    );
  });
});

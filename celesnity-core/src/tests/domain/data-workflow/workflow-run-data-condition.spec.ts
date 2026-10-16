import type { WorkflowRunDataCondition } from '@domain/data-workflow/models/workflow-graph';
import {
  evaluateRunDataCondition,
  RunDataConditionEvaluationError,
} from '@domain/data-workflow/services/evaluate-run-data-branch';

const predicate = { column: 'amount', operator: 'GT', value: 10 } as const;

describe('evaluateRunDataCondition', () => {
  it('evaluates Any, All, and Count from bounded aggregate facts', () => {
    const facts = { totalRows: 100, matchingRows: 7 };
    const any: WorkflowRunDataCondition = {
      targetNodeId: 'target-1',
      quantifier: 'ANY',
      predicate,
    };
    const all: WorkflowRunDataCondition = {
      targetNodeId: 'target-1',
      quantifier: 'ALL',
      predicate,
    };
    const countAtLeastFive: WorkflowRunDataCondition = {
      targetNodeId: 'target-1',
      quantifier: 'COUNT',
      predicate,
      count: { operator: 'GTE', threshold: 5 },
    };
    const countExactlySeven: WorkflowRunDataCondition = {
      targetNodeId: 'target-1',
      quantifier: 'COUNT',
      predicate,
      count: { operator: 'EQ', threshold: 7 },
    };
    const countFewerThanSeven: WorkflowRunDataCondition = {
      targetNodeId: 'target-1',
      quantifier: 'COUNT',
      predicate,
      count: { operator: 'LT', threshold: 7 },
    };

    expect(evaluateRunDataCondition(any, facts)).toBe(true);
    expect(evaluateRunDataCondition(all, facts)).toBe(false);
    expect(evaluateRunDataCondition(countAtLeastFive, facts)).toBe(true);
    expect(evaluateRunDataCondition(countExactlySeven, facts)).toBe(true);
    expect(evaluateRunDataCondition(countFewerThanSeven, facts)).toBe(false);
  });

  it('treats Any and All as false for an empty output and compares Count with zero', () => {
    const facts = { totalRows: 0, matchingRows: 0 };
    expect(
      evaluateRunDataCondition({ targetNodeId: 'target-1', quantifier: 'ANY', predicate }, facts),
    ).toBe(false);
    expect(
      evaluateRunDataCondition({ targetNodeId: 'target-1', quantifier: 'ALL', predicate }, facts),
    ).toBe(false);
    expect(
      evaluateRunDataCondition(
        {
          targetNodeId: 'target-1',
          quantifier: 'COUNT',
          predicate,
          count: { operator: 'EQ', threshold: 0 },
        },
        facts,
      ),
    ).toBe(true);
  });

  it.each([
    [{ totalRows: -1, matchingRows: 0 }],
    [{ totalRows: 3, matchingRows: -1 }],
    [{ totalRows: 3, matchingRows: 4 }],
    [{ totalRows: 1.5, matchingRows: 1 }],
  ])('rejects invalid facts %j', (facts) => {
    expect(() =>
      evaluateRunDataCondition({ targetNodeId: 'target-1', quantifier: 'ANY', predicate }, facts),
    ).toThrow(RunDataConditionEvaluationError);
  });

  it('rejects a negative Count threshold even if a caller bypassed graph parsing', () => {
    const invalid = {
      targetNodeId: 'target-1',
      quantifier: 'COUNT',
      predicate,
      count: { operator: 'GTE', threshold: -1 },
    } as unknown as WorkflowRunDataCondition;

    expect(() => evaluateRunDataCondition(invalid, { totalRows: 2, matchingRows: 1 })).toThrow(
      RunDataConditionEvaluationError,
    );
  });
});

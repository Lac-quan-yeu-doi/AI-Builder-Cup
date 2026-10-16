import {
  type ExecutionOutputConditionPlan,
  validateExecutionOutputConditionPlan,
  validateExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';

const PLAN: ExecutionOutputConditionPlan = {
  targets: [
    {
      targetNodeId: 'target-1',
      predicates: [
        { branchId: 'branch-1', column: 'amount', operator: 'GT', value: 100 },
        { branchId: 'branch-2', column: 'status', operator: 'EQ', value: 'ready' },
      ],
    },
  ],
};
const EXECUTION_ID = '46e0a6fd-3e0f-41b2-8f69-490db51d5eb6';

describe('execution output facts', () => {
  it('validates and normalizes a grouped scalar-only output plan', () => {
    expect(validateExecutionOutputConditionPlan(PLAN)).toEqual(PLAN);
  });

  it('validates output facts against execution, target, and requested branch identities', () => {
    expect(
      validateExecutionOutputFacts(PLAN, EXECUTION_ID, {
        executionId: EXECUTION_ID,
        targets: [
          {
            targetNodeId: 'target-1',
            totalRows: 4,
            matchesByBranchId: { 'branch-1': 3, 'branch-2': 2 },
          },
        ],
      }),
    ).toEqual({
      executionId: EXECUTION_ID,
      targets: [
        {
          targetNodeId: 'target-1',
          totalRows: 4,
          matchesByBranchId: { 'branch-1': 3, 'branch-2': 2 },
        },
      ],
    });
  });

  it.each([
    ['wrong execution', 'different-execution', 'target-1', { 'branch-1': 1, 'branch-2': 1 }, 1],
    ['wrong target', EXECUTION_ID, 'other-target', { 'branch-1': 1, 'branch-2': 1 }, 1],
    ['missing branch', EXECUTION_ID, 'target-1', { 'branch-1': 1 }, 1],
    ['extra branch', EXECUTION_ID, 'target-1', { 'branch-1': 1, 'branch-2': 1, extra: 0 }, 1],
    ['negative total', EXECUTION_ID, 'target-1', { 'branch-1': 0, 'branch-2': 0 }, -1],
    ['matching count above total', EXECUTION_ID, 'target-1', { 'branch-1': 2, 'branch-2': 0 }, 1],
  ])('rejects %s facts', (_label, executionId, targetNodeId, matchesByBranchId, totalRows) => {
    expect(() =>
      validateExecutionOutputFacts(PLAN, EXECUTION_ID, {
        executionId,
        targets: [{ targetNodeId, totalRows, matchesByBranchId }],
      }),
    ).toThrow();
  });

  it('rejects duplicated branches in one target plan and non-scalar values', () => {
    expect(() =>
      validateExecutionOutputConditionPlan({
        targets: [
          {
            targetNodeId: 'target-1',
            predicates: [
              { branchId: 'same', column: 'a', operator: 'EQ', value: 1 },
              { branchId: 'same', column: 'b', operator: 'EQ', value: 2 },
            ],
          },
        ],
      }),
    ).toThrow('duplicate branch ID');
    expect(() =>
      validateExecutionOutputConditionPlan({
        targets: [
          {
            targetNodeId: 'target-1',
            predicates: [
              { branchId: 'branch-1', column: 'a', operator: 'EQ', value: { unsafe: true } },
            ],
          },
        ],
      }),
    ).toThrow('scalar');
  });
});

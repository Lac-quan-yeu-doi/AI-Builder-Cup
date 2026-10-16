import type {
  WorkflowRunDataCondition,
  WorkflowRunDataConditionalBranch,
} from '@domain/data-workflow/models/workflow-graph';

export interface RunDataBranchFacts {
  readonly totalRows: number;
  readonly matchingRows: number;
}

export class RunDataConditionEvaluationError extends Error {
  public constructor(public readonly code: 'INVALID_CONDITION' | 'INVALID_FACTS') {
    super(code);
    this.name = RunDataConditionEvaluationError.name;
  }
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateFacts(facts: RunDataBranchFacts): void {
  if (
    !isNonNegativeSafeInteger(facts.totalRows) ||
    !isNonNegativeSafeInteger(facts.matchingRows) ||
    facts.matchingRows > facts.totalRows
  ) {
    throw new RunDataConditionEvaluationError('INVALID_FACTS');
  }
}

function compareCount(
  condition: Extract<WorkflowRunDataCondition, { readonly quantifier: 'COUNT' }>,
  matchingRows: number,
): boolean {
  const { operator, threshold } = condition.count;
  if (!isNonNegativeSafeInteger(threshold)) {
    throw new RunDataConditionEvaluationError('INVALID_CONDITION');
  }
  switch (operator) {
    case 'GTE':
      return matchingRows >= threshold;
    case 'GT':
      return matchingRows > threshold;
    case 'EQ':
      return matchingRows === threshold;
    case 'LT':
      return matchingRows < threshold;
  }
}

export function evaluateRunDataCondition(
  condition: WorkflowRunDataCondition,
  facts: RunDataBranchFacts,
): boolean {
  validateFacts(facts);
  switch (condition.quantifier) {
    case 'ANY':
      return facts.totalRows > 0 && facts.matchingRows > 0;
    case 'ALL':
      return facts.totalRows > 0 && facts.matchingRows === facts.totalRows;
    case 'COUNT':
      return compareCount(condition, facts.matchingRows);
  }
}

export function evaluateRunDataBranch(
  branch: WorkflowRunDataConditionalBranch,
  facts: RunDataBranchFacts,
): boolean {
  return evaluateRunDataCondition(branch.runDataCondition, facts);
}

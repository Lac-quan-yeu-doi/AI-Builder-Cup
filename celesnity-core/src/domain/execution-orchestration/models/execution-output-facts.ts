export type ExecutionOutputPredicateOperator =
  'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IS_EMPTY' | 'IS_NOT_EMPTY';

export type ExecutionOutputScalar = string | number | boolean | null;

export interface ExecutionOutputPredicate {
  readonly branchId: string;
  readonly column: string;
  readonly operator: ExecutionOutputPredicateOperator;
  readonly value?: ExecutionOutputScalar;
}

export interface ExecutionOutputTargetPlan {
  readonly targetNodeId: string;
  readonly predicates: readonly ExecutionOutputPredicate[];
}

/** A bounded execution-scoped plan; it contains predicates, never input rows. */
export interface ExecutionOutputConditionPlan {
  readonly targets: readonly ExecutionOutputTargetPlan[];
}

/** Aggregated facts for one target written by one pipeline execution. */
export interface ExecutionTargetOutputFacts {
  readonly targetNodeId: string;
  readonly totalRows: number;
  readonly matchesByBranchId: Readonly<Record<string, number>>;
}

export interface ExecutionOutputFacts {
  readonly executionId: string;
  readonly targets: readonly ExecutionTargetOutputFacts[];
}

export const EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS = Object.freeze({
  maxTargets: 32,
  maxPredicates: 128,
  maxIdentifierLength: 255,
  maxStringValueLength: 4096,
});
const OPERATORS: ReadonlySet<string> = new Set([
  'EQ',
  'NE',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
]);

export function validateExecutionOutputConditionPlan(input: unknown): ExecutionOutputConditionPlan {
  if (!isRecord(input) || !Array.isArray(input.targets)) {
    throw new Error('Output condition plan must contain a target list.');
  }
  if (
    input.targets.length === 0 ||
    input.targets.length > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxTargets
  ) {
    throw new Error('Output condition plan target count is outside the supported bound.');
  }

  const targetIds = new Set<string>();
  const branchIds = new Set<string>();
  let predicateCount = 0;
  const targets = input.targets.map((rawTarget) => {
    if (!isRecord(rawTarget) || !Array.isArray(rawTarget.predicates)) {
      throw new Error('Output condition plan target is invalid.');
    }
    const targetNodeId = boundedIdentifier(rawTarget.targetNodeId, 'Target node ID');
    if (targetIds.has(targetNodeId)) {
      throw new Error('Output condition plan contains a duplicate target node.');
    }
    targetIds.add(targetNodeId);
    if (rawTarget.predicates.length === 0) {
      throw new Error('Output condition plan target must contain at least one predicate.');
    }
    predicateCount += rawTarget.predicates.length;
    if (predicateCount > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxPredicates) {
      throw new Error('Output condition plan predicate count is outside the supported bound.');
    }

    const predicates = rawTarget.predicates.map((rawPredicate) => {
      if (!isRecord(rawPredicate)) throw new Error('Output condition predicate is invalid.');
      const branchId = boundedIdentifier(rawPredicate.branchId, 'Branch ID');
      const column = boundedIdentifier(rawPredicate.column, 'Column');
      if (branchIds.has(branchId)) {
        throw new Error('Output condition plan contains a duplicate branch ID.');
      }
      branchIds.add(branchId);
      if (typeof rawPredicate.operator !== 'string' || !OPERATORS.has(rawPredicate.operator)) {
        throw new Error('Output condition plan contains an unsupported operator.');
      }

      const operator = rawPredicate.operator as ExecutionOutputPredicateOperator;
      const value = rawPredicate.value;
      const requiresValue = operator !== 'IS_EMPTY' && operator !== 'IS_NOT_EMPTY';
      if (requiresValue && value === undefined) {
        throw new Error('Output condition predicate requires a scalar value.');
      }
      if (!requiresValue && value !== undefined) {
        throw new Error('Empty-value predicates cannot include a comparison value.');
      }
      if (
        value !== undefined &&
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new Error('Output condition predicate value must be a scalar.');
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('Output condition predicate contains a non-finite number.');
      }
      if (
        typeof value === 'string' &&
        value.length > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxStringValueLength
      ) {
        throw new Error('Output condition predicate string value exceeds the supported bound.');
      }
      if (
        (operator === 'GT' || operator === 'GTE' || operator === 'LT' || operator === 'LTE') &&
        typeof value !== 'string' &&
        typeof value !== 'number'
      ) {
        throw new Error('Ordered output condition operators require a number or date string.');
      }
      return {
        branchId,
        column,
        operator,
        ...(value === undefined ? {} : { value }),
      } satisfies ExecutionOutputPredicate;
    });
    return { targetNodeId, predicates } satisfies ExecutionOutputTargetPlan;
  });

  return { targets };
}

export function validateExecutionOutputFacts(
  plan: ExecutionOutputConditionPlan,
  executionId: string,
  input: unknown,
): ExecutionOutputFacts {
  if (!isRecord(input) || !Array.isArray(input.targets)) {
    throw new Error('Output facts payload is invalid.');
  }
  if (input.executionId !== executionId) {
    throw new Error('Output facts belong to a different execution.');
  }
  if (input.targets.length !== plan.targets.length) {
    throw new Error('Output facts do not contain exactly one result for every requested target.');
  }

  const factsByTarget = new Map<string, unknown>();
  for (const rawTarget of input.targets) {
    if (!isRecord(rawTarget)) throw new Error('Output facts target result is invalid.');
    const targetNodeId = boundedIdentifier(rawTarget.targetNodeId, 'Target node ID');
    if (factsByTarget.has(targetNodeId)) {
      throw new Error('Output facts contain a duplicate target result.');
    }
    factsByTarget.set(targetNodeId, rawTarget);
  }

  const targets = plan.targets.map((targetPlan) => {
    const rawResult = factsByTarget.get(targetPlan.targetNodeId);
    if (!isRecord(rawResult)) {
      throw new Error('Output facts are missing a requested target result.');
    }
    const totalRows = rawResult.totalRows;
    if (typeof totalRows !== 'number' || !Number.isSafeInteger(totalRows) || totalRows < 0) {
      throw new Error('Output facts contain an invalid total row count.');
    }
    const matches = rawResult.matchesByBranchId;
    if (!isRecord(matches)) {
      throw new Error('Output facts matching counts must be an object.');
    }
    const expectedBranchIds = targetPlan.predicates.map((predicate) => predicate.branchId).sort();
    const actualBranchIds = Object.keys(matches).sort();
    if (
      expectedBranchIds.length !== actualBranchIds.length ||
      expectedBranchIds.some((branchId, index) => branchId !== actualBranchIds[index])
    ) {
      throw new Error('Output facts do not match the requested branch set.');
    }
    const matchesByBranchId: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const branchId of expectedBranchIds) {
      const count = matches[branchId];
      if (
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > totalRows
      ) {
        throw new Error('Output facts contain an invalid matching row count.');
      }
      matchesByBranchId[branchId] = count;
    }
    return { targetNodeId: targetPlan.targetNodeId, totalRows, matchesByBranchId };
  });

  return { executionId, targets };
}

function boundedIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxIdentifierLength ||
    containsControlCharacters(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

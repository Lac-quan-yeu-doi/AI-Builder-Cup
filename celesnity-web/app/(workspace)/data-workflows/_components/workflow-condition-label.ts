import type {
  DataWorkflowCanvasNode,
  DataWorkflowCondition,
  DataWorkflowRunDataPredicate,
} from '@/src/entities/models/data-workflow-graph';

type ConditionalNode = Extract<DataWorkflowCanvasNode, { readonly type: 'CONDITIONAL_SPLIT' }>;

const comparisonLabels = {
  eq: 'is',
  ne: 'is not',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  EQ: 'is',
  NE: 'is not',
  GT: 'is greater than',
  GTE: 'is at least',
  LT: 'is less than',
  LTE: 'is at most',
  IS_EMPTY: 'is empty',
  IS_NOT_EMPTY: 'is not empty',
} as const;

function formatValue(value: string | number | boolean | null): string {
  return value === null ? 'null' : String(value);
}

function contextConditionLabel(condition: DataWorkflowCondition): string {
  if ('conditions' in condition) {
    return `${condition.op === 'all' ? 'All' : 'Any'} conditions`;
  }
  const path = condition.path.filter(Boolean).join('.');
  if (condition.path.length < 2) return 'Choose a property';
  return `${path} ${comparisonLabels[condition.op]} ${formatValue(condition.value)}`;
}

function runDataPredicateLabel(predicate: DataWorkflowRunDataPredicate): string {
  const comparison = comparisonLabels[predicate.operator];
  return 'value' in predicate
    ? `${predicate.column} ${comparison} ${formatValue(predicate.value)}`
    : `${predicate.column} ${comparison}`;
}

export function conditionRouteLabel(node: ConditionalNode, branchId: string): string {
  const index = node.branches.findIndex((branch) => branch.id === branchId);
  if (index < 0) return 'Unknown condition';
  const branch = node.branches[index]!;
  if ('fallback' in branch) return 'Fallback';
  const summary =
    'runDataCondition' in branch
      ? `${branch.runDataCondition.quantifier === 'ALL' ? 'All rows' : branch.runDataCondition.quantifier === 'COUNT' ? 'Count rows' : 'Any row'}: ${runDataPredicateLabel(branch.runDataCondition.predicate)}`
      : contextConditionLabel(branch.condition);
  return `Condition ${index + 1} · ${summary}`;
}

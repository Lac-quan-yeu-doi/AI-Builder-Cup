import type { PipelineReference } from '@application/data-workflow/interfaces/i-workflow-access';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import type {
  Condition,
  Scalar,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowCanvasPosition,
  WorkflowRunDataCondition,
  WorkflowRunDataConditionalBranchDefinition,
  WorkflowLegacyConditionalBranchDefinition,
  WorkflowRunDataPredicate,
} from '@domain/data-workflow/models/workflow-graph';
import type {
  WorkflowAutomaticTrigger,
  WorkflowCalendarTrigger,
  WorkflowIntervalTrigger,
  WorkflowTrigger,
  WorkflowWatchSourceTrigger,
  WatchSourceChangeType,
  WorkflowWeekday,
} from '@domain/data-workflow/models/workflow-trigger';
import { WORKFLOW_WEEKDAYS } from '@domain/data-workflow/models/workflow-trigger';
import { validateWorkflowGraph } from '@domain/data-workflow/services/validate-workflow-graph';

export function parseWorkflowGraph(input: unknown): WorkflowGraph {
  const graph = record(input);
  const nodes = array(graph.nodes).map(parseNode);
  const edges = array(graph.edges).map(parseEdge);
  const parsed: WorkflowGraph = { nodes, edges };
  const issues = validateWorkflowGraph(parsed);
  if (issues.length > 0) throw WorkflowAuthoringError.invalidGraph(issues);
  return parsed;
}

export function pipelineReferences(graph: WorkflowGraph): readonly PipelineReference[] {
  const references = new Map<string, PipelineReference>();
  for (const node of graph.nodes) {
    if (node.type !== 'PIPELINE') continue;
    const reference = { pipelineId: node.pipelineId, versionNumber: node.versionNumber };
    references.set(`${reference.pipelineId}:${String(reference.versionNumber)}`, reference);
  }
  return [...references.values()];
}

export function triggerSnapshot(graph: WorkflowGraph): Readonly<Record<string, unknown>> {
  const trigger = graph.nodes.find((node) => node.type === 'TRIGGER');
  if (trigger === undefined) throw WorkflowAuthoringError.invalidGraph();
  return trigger.config === undefined
    ? { triggerNodeId: trigger.id }
    : { triggerNodeId: trigger.id, config: trigger.config };
}

/** Returns the validated automatic trigger from the graph, if this is not manual-only. */
export function automaticTrigger(graph: WorkflowGraph): WorkflowAutomaticTrigger | undefined {
  const trigger = graph.nodes.find((node) => node.type === 'TRIGGER');
  return trigger?.config?.type === 'CALENDAR' || trigger?.config?.type === 'INTERVAL'
    ? trigger.config
    : undefined;
}

export function workflowName(value: unknown): string {
  if (typeof value !== 'string') throw WorkflowAuthoringError.invalidName();
  const name = value.trim();
  if (name.length < 1 || name.length > 160) throw WorkflowAuthoringError.invalidName();
  return name;
}

function parseNode(input: unknown): WorkflowGraphNode {
  const node = record(input);
  const id = text(node.id);
  switch (node.type) {
    case 'TRIGGER':
      onlyProperties(node, ['id', 'type', 'config', 'position']);
      return node.config === undefined
        ? { id, type: 'TRIGGER', ...parseNodePosition(node.position) }
        : {
            id,
            type: 'TRIGGER',
            config: parseTrigger(node.config),
            ...parseNodePosition(node.position),
          };
    case 'PIPELINE':
      return {
        id,
        type: 'PIPELINE',
        pipelineId: text(node.pipelineId),
        versionNumber: positiveInteger(node.versionNumber),
        ...parseNodePosition(node.position),
      };
    case 'PIPELINE_OUTCOME':
      onlyProperties(node, ['id', 'type', 'position']);
      return { id, type: 'PIPELINE_OUTCOME', ...parseNodePosition(node.position) };
    case 'PARALLEL_SPLIT':
      return { id, type: 'PARALLEL_SPLIT', ...parseNodePosition(node.position) };
    case 'JOIN':
      return { id, type: 'JOIN', ...parseNodePosition(node.position) };
    case 'CONDITIONAL_SPLIT':
      if (node.conditionKind === 'RUN_DATA') {
        onlyProperties(node, ['id', 'type', 'conditionKind', 'branches', 'mode', 'position']);
        return {
          id,
          type: 'CONDITIONAL_SPLIT',
          conditionKind: 'RUN_DATA',
          branches: array(node.branches).map(parseRunDataBranch),
          mode: parseConditionalMode(node.mode),
          ...parseNodePosition(node.position),
        };
      }
      if (Object.prototype.hasOwnProperty.call(node, 'conditionKind')) return invalidGraph();
      return {
        id,
        type: 'CONDITIONAL_SPLIT',
        branches: array(node.branches).map(parseBranch),
        mode: parseConditionalMode(node.mode),
        ...parseNodePosition(node.position),
      };
    default:
      return invalidGraph();
  }
}

function parseNodePosition(input: unknown): { readonly position?: WorkflowCanvasPosition } {
  if (input === undefined) return {};
  const position = record(input);
  onlyProperties(position, ['x', 'y']);
  return { position: { x: finiteNumber(position.x), y: finiteNumber(position.y) } };
}

function parseTrigger(input: unknown): WorkflowTrigger {
  const config = record(input);
  switch (config.type) {
    case 'CALENDAR':
      return parseCalendarTrigger(config);
    case 'INTERVAL':
      return parseIntervalTrigger(config);
    case 'WATCH_SOURCE':
      return parseWatchSourceTrigger(config);
    default:
      return invalidGraph();
  }
}

function parseWatchSourceTrigger(
  config: Readonly<Record<string, unknown>>,
): WorkflowWatchSourceTrigger {
  if (config.mode === 'POLLING') return parsePollingWatchSourceTrigger(config);
  if (config.mode === 'CDC') return parseCdcWatchSourceTrigger(config);
  return invalidGraph();
}

function parseCalendarTrigger(config: Readonly<Record<string, unknown>>): WorkflowCalendarTrigger {
  onlyProperties(config, ['type', 'timeOfDay', 'weekdays', 'timezone']);
  const timeOfDay = text(config.timeOfDay).trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(timeOfDay)) return invalidGraph();
  const weekdays = array(config.weekdays).map(parseWeekday);
  if (weekdays.length === 0 || new Set(weekdays).size !== weekdays.length) return invalidGraph();
  const timezone = text(config.timezone).trim();
  requireIanaTimezone(timezone);
  const orderedWeekdays = WORKFLOW_WEEKDAYS.filter((weekday) => weekdays.includes(weekday));
  return { type: 'CALENDAR', timeOfDay, weekdays: orderedWeekdays, timezone };
}

function parsePollingWatchSourceTrigger(
  config: Readonly<Record<string, unknown>>,
): WorkflowWatchSourceTrigger {
  onlyProperties(config, ['type', 'mode', 'databaseServiceId', 'everySeconds', 'relations']);
  const everySeconds = positiveInteger(config.everySeconds);
  if (everySeconds < 10) return invalidGraph();
  const relations = array(config.relations).map(parsePollingRelation);
  assertUniqueRelations(relations);
  return {
    type: 'WATCH_SOURCE',
    mode: 'POLLING',
    databaseServiceId: text(config.databaseServiceId),
    everySeconds,
    relations,
  };
}

function parseCdcWatchSourceTrigger(
  config: Readonly<Record<string, unknown>>,
): WorkflowWatchSourceTrigger {
  onlyProperties(config, [
    'type',
    'mode',
    'databaseServiceId',
    'aggregationWindowSeconds',
    'relations',
    'changeTypes',
  ]);
  const aggregationWindowSeconds = positiveInteger(config.aggregationWindowSeconds);
  if (aggregationWindowSeconds > 300) return invalidGraph();
  const relations = array(config.relations).map(parseCdcRelation);
  assertUniqueRelations(relations);
  const changeTypes = parseChangeTypes(config.changeTypes);
  return {
    type: 'WATCH_SOURCE',
    mode: 'CDC',
    databaseServiceId: text(config.databaseServiceId),
    aggregationWindowSeconds,
    relations,
    changeTypes,
  };
}

function parsePollingRelation(input: unknown): {
  readonly schema: string;
  readonly table: string;
  readonly cursor: { readonly changeColumn: string; readonly tieBreakerColumn: string };
} {
  const relation = record(input);
  onlyProperties(relation, ['schema', 'table', 'cursor']);
  const cursor = record(relation.cursor);
  onlyProperties(cursor, ['changeColumn', 'tieBreakerColumn']);
  const changeColumn = text(cursor.changeColumn).trim();
  const tieBreakerColumn = text(cursor.tieBreakerColumn).trim();
  if (changeColumn === tieBreakerColumn) return invalidGraph();
  return {
    schema: text(relation.schema),
    table: text(relation.table),
    cursor: { changeColumn, tieBreakerColumn },
  };
}

function parseCdcRelation(input: unknown): { readonly schema: string; readonly table: string } {
  const relation = record(input);
  onlyProperties(relation, ['schema', 'table']);
  return { schema: text(relation.schema), table: text(relation.table) };
}

function parseChangeTypes(value: unknown): readonly WatchSourceChangeType[] {
  const changeTypes = array(value).map((item): WatchSourceChangeType => {
    if (item !== 'INSERT' && item !== 'UPDATE' && item !== 'DELETE') return invalidGraph();
    return item;
  });
  if (changeTypes.length === 0 || new Set(changeTypes).size !== changeTypes.length)
    return invalidGraph();
  return changeTypes;
}

function parseWeekday(value: unknown): WorkflowWeekday {
  if (typeof value !== 'string' || !WORKFLOW_WEEKDAYS.includes(value as WorkflowWeekday)) {
    return invalidGraph();
  }
  return value as WorkflowWeekday;
}

function assertUniqueRelations(
  relations: readonly { readonly schema: string; readonly table: string }[],
): void {
  const bySchema = new Map<string, Set<string>>();
  for (const relation of relations) {
    const tables = bySchema.get(relation.schema) ?? new Set<string>();
    if (tables.has(relation.table)) return invalidGraph();
    tables.add(relation.table);
    bySchema.set(relation.schema, tables);
  }
  if (relations.length === 0) return invalidGraph();
}

function parseIntervalTrigger(config: Readonly<Record<string, unknown>>): WorkflowIntervalTrigger {
  onlyProperties(config, ['type', 'everySeconds', 'anchorAt']);
  const everySeconds = positiveInteger(config.everySeconds);
  if (everySeconds < 10) return invalidGraph();
  const rawAnchor = text(config.anchorAt);
  const anchor = strictUtcInstant(rawAnchor);
  return { type: 'INTERVAL', everySeconds, anchorAt: anchor.toISOString() };
}

function strictUtcInstant(value: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/u.exec(value);
  if (match === null) return invalidGraph();

  const anchor = new Date(value);
  if (!Number.isFinite(anchor.getTime())) return invalidGraph();

  // Date normalizes malformed components (for example, February 30). Compare
  // against its canonical UTC representation so only real instants enter a
  // persisted trigger configuration.
  const milliseconds = (match[2] ?? '').padEnd(3, '0');
  if (anchor.toISOString() !== `${match[1]}.${milliseconds}Z`) return invalidGraph();
  return anchor;
}

function requireIanaTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    invalidGraph();
  }
}

function onlyProperties(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalidGraph();
}

function parseBranch(input: unknown): WorkflowLegacyConditionalBranchDefinition {
  const branch = record(input);
  if (branch.fallback === true) {
    if (branch.condition !== undefined) return invalidGraph();
    return { id: text(branch.id), fallback: true };
  }
  if (branch.fallback !== undefined) return invalidGraph();
  return { id: text(branch.id), condition: parseCondition(branch.condition) };
}

function parseRunDataBranch(input: unknown): WorkflowRunDataConditionalBranchDefinition {
  const branch = record(input);
  if (branch.fallback === true) {
    onlyProperties(branch, ['id', 'fallback']);
    return { id: text(branch.id), fallback: true };
  }
  onlyProperties(branch, ['id', 'runDataCondition']);
  return { id: text(branch.id), runDataCondition: parseRunDataCondition(branch.runDataCondition) };
}

function parseRunDataCondition(input: unknown): WorkflowRunDataCondition {
  const condition = record(input);
  const targetNodeId = nonBlankText(condition.targetNodeId);
  const predicate = parseRunDataPredicate(condition.predicate);
  if (condition.quantifier === 'ANY' || condition.quantifier === 'ALL') {
    onlyProperties(condition, ['targetNodeId', 'quantifier', 'predicate']);
    return { targetNodeId, quantifier: condition.quantifier, predicate };
  }
  if (condition.quantifier === 'COUNT') {
    onlyProperties(condition, ['targetNodeId', 'quantifier', 'predicate', 'count']);
    const count = record(condition.count);
    onlyProperties(count, ['operator', 'threshold']);
    if (
      count.operator !== 'GTE' &&
      count.operator !== 'GT' &&
      count.operator !== 'EQ' &&
      count.operator !== 'LT'
    ) {
      return invalidGraph();
    }
    const threshold = nonNegativeInteger(count.threshold);
    return {
      targetNodeId,
      quantifier: 'COUNT',
      predicate,
      count: { operator: count.operator, threshold },
    };
  }
  return invalidGraph();
}

function parseRunDataPredicate(input: unknown): WorkflowRunDataPredicate {
  const predicate = record(input);
  const column = nonBlankText(predicate.column);
  if (predicate.operator === 'IS_EMPTY' || predicate.operator === 'IS_NOT_EMPTY') {
    onlyProperties(predicate, ['column', 'operator']);
    return { column, operator: predicate.operator };
  }
  if (predicate.operator === 'EQ' || predicate.operator === 'NE') {
    onlyProperties(predicate, ['column', 'operator', 'value']);
    if (!Object.prototype.hasOwnProperty.call(predicate, 'value')) return invalidGraph();
    return { column, operator: predicate.operator, value: scalar(predicate.value) };
  }
  if (
    predicate.operator === 'GT' ||
    predicate.operator === 'GTE' ||
    predicate.operator === 'LT' ||
    predicate.operator === 'LTE'
  ) {
    onlyProperties(predicate, ['column', 'operator', 'value']);
    if (typeof predicate.value !== 'string' && typeof predicate.value !== 'number') {
      return invalidGraph();
    }
    return {
      column,
      operator: predicate.operator,
      value: finiteOrText(predicate.value),
    };
  }
  return invalidGraph();
}

function parseConditionalMode(value: unknown): 'FIRST_MATCH' | 'ALL_MATCH' {
  if (value === 'FIRST_MATCH' || value === 'ALL_MATCH') return value;
  return invalidGraph();
}

function parseCondition(input: unknown): Condition {
  const condition = record(input);
  if (condition.op === 'all' || condition.op === 'any') {
    return { op: condition.op, conditions: array(condition.conditions).map(parseCondition) };
  }
  if (
    condition.op === 'eq' ||
    condition.op === 'ne' ||
    condition.op === 'gt' ||
    condition.op === 'gte' ||
    condition.op === 'lt' ||
    condition.op === 'lte'
  ) {
    return {
      op: condition.op,
      path: array(condition.path).map(text),
      value: scalar(condition.value),
    };
  }
  return invalidGraph();
}

function parseEdge(input: unknown): WorkflowGraphEdge {
  const edge = record(input);
  return {
    id: text(edge.id),
    sourceNodeId: text(edge.sourceNodeId),
    sourcePortId: text(edge.sourcePortId),
    targetNodeId: text(edge.targetNodeId),
    targetPortId: text(edge.targetPortId),
  };
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidGraph();
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) return invalidGraph();
  return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : invalidGraph();
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return invalidGraph();
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalidGraph();
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalidGraph();
  return value;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidGraph();
  return value;
}

function nonBlankText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return invalidGraph();
  return value;
}

function finiteOrText(value: string | number): string | number {
  if (typeof value === 'number' && !Number.isFinite(value)) return invalidGraph();
  return value;
}

function scalar(value: unknown): Scalar {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  return invalidGraph();
}

function invalidGraph(): never {
  throw WorkflowAuthoringError.invalidGraph();
}

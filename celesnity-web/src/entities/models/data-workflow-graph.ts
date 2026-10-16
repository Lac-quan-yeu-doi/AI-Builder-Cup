import type {
  DataWorkflowWatchSourceTrigger,
  DataWorkflowWatchSourceWeekday,
} from './data-workflow-watch-source';

export type DataWorkflowNodeType =
  'TRIGGER' | 'PIPELINE' | 'PIPELINE_OUTCOME' | 'PARALLEL_SPLIT' | 'CONDITIONAL_SPLIT' | 'JOIN';

export type DataWorkflowCondition =
  | {
      readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
      readonly path: readonly string[];
      readonly value: string | number | boolean | null;
    }
  | { readonly op: 'all' | 'any'; readonly conditions: readonly DataWorkflowCondition[] };

export interface DataWorkflowConditionBranch {
  readonly id: string;
  readonly condition: DataWorkflowCondition;
}

export interface DataWorkflowFallbackBranch {
  readonly id: string;
  readonly fallback: true;
}

export type DataWorkflowBranch = DataWorkflowConditionBranch | DataWorkflowFallbackBranch;

export interface DataWorkflowPipelineTargetColumn {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
}

export interface DataWorkflowPipelineTarget {
  readonly targetNodeId: string;
  readonly tableName: string;
  readonly schemaStatus: 'KNOWN' | 'RUNTIME_DEPENDENT' | 'UNAVAILABLE';
  readonly columns: readonly DataWorkflowPipelineTargetColumn[];
}

export type DataWorkflowRunDataPredicate =
  | {
      readonly column: string;
      readonly operator: 'EQ' | 'NE';
      readonly value: string | number | boolean | null;
    }
  | {
      readonly column: string;
      readonly operator: 'GT' | 'GTE' | 'LT' | 'LTE';
      readonly value: string | number;
    }
  | { readonly column: string; readonly operator: 'IS_EMPTY' | 'IS_NOT_EMPTY' };

export interface DataWorkflowRunDataCountCondition {
  readonly operator: 'GTE' | 'GT' | 'EQ' | 'LT';
  readonly threshold: number;
}

export type DataWorkflowRunDataCondition =
  | {
      readonly targetNodeId: string;
      readonly quantifier: 'ANY' | 'ALL';
      readonly predicate: DataWorkflowRunDataPredicate;
    }
  | {
      readonly targetNodeId: string;
      readonly quantifier: 'COUNT';
      readonly predicate: DataWorkflowRunDataPredicate;
      readonly count: DataWorkflowRunDataCountCondition;
    };

export interface DataWorkflowRunDataConditionBranch {
  readonly id: string;
  readonly runDataCondition: DataWorkflowRunDataCondition;
}

export type DataWorkflowRunDataBranch =
  DataWorkflowRunDataConditionBranch | DataWorkflowFallbackBranch;

export type DataWorkflowTrigger =
  | { readonly type: 'MANUAL' }
  | {
      readonly type: 'CALENDAR';
      readonly timeOfDay: string;
      readonly weekdays: readonly DataWorkflowWatchSourceWeekday[];
      readonly timezone: string;
    }
  | { readonly type: 'INTERVAL'; readonly everySeconds: number; readonly anchorAt: string }
  | DataWorkflowWatchSourceTrigger;

export interface DataWorkflowCanvasPosition {
  readonly x: number;
  readonly y: number;
}

interface DataWorkflowNodeBase {
  readonly id: string;
  readonly position: DataWorkflowCanvasPosition;
}

export type DataWorkflowCanvasNode =
  | (DataWorkflowNodeBase & { readonly type: 'TRIGGER'; readonly trigger: DataWorkflowTrigger })
  | (DataWorkflowNodeBase & {
      readonly type: 'PIPELINE';
      readonly pipelineId: string;
      readonly versionNumber: number;
    })
  | (DataWorkflowNodeBase & { readonly type: 'PARALLEL_SPLIT' | 'JOIN' | 'PIPELINE_OUTCOME' })
  | (DataWorkflowNodeBase &
      (
        | {
            readonly type: 'CONDITIONAL_SPLIT';
            readonly conditionKind?: undefined;
            readonly mode: 'FIRST_MATCH' | 'ALL_MATCH';
            readonly branches: readonly DataWorkflowBranch[];
          }
        | {
            readonly type: 'CONDITIONAL_SPLIT';
            readonly conditionKind: 'RUN_DATA';
            readonly mode: 'FIRST_MATCH' | 'ALL_MATCH';
            readonly branches: readonly DataWorkflowRunDataBranch[];
          }
      ));

export interface DataWorkflowEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
}

export interface DataWorkflowCanvasGraph {
  readonly nodes: readonly DataWorkflowCanvasNode[];
  readonly edges: readonly DataWorkflowEdge[];
}

export interface DataWorkflowGraphDto {
  readonly nodes: readonly Record<string, unknown>[];
  readonly edges: readonly DataWorkflowEdge[];
}

export interface DataWorkflowDraft {
  readonly name: string;
  readonly graph: DataWorkflowCanvasGraph;
}

export function createManualWorkflowDraft(name = 'Untitled workflow'): DataWorkflowDraft {
  return {
    name,
    graph: {
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER',
          trigger: { type: 'MANUAL' },
          position: { x: 48, y: 160 },
        },
      ],
      edges: [],
    },
  };
}

export function removeWorkflowNode(
  graph: DataWorkflowCanvasGraph,
  nodeId: string,
): DataWorkflowCanvasGraph {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined || node.type === 'TRIGGER') return graph;
  return {
    nodes: graph.nodes.filter((candidate) => candidate.id !== nodeId),
    edges: graph.edges.filter(
      (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
    ),
  };
}

export function removeWorkflowEdge(
  graph: DataWorkflowCanvasGraph,
  edgeId: string,
): DataWorkflowCanvasGraph {
  if (!graph.edges.some((edge) => edge.id === edgeId)) return graph;
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

export function replaceWorkflowNode(
  graph: DataWorkflowCanvasGraph,
  nextNode: DataWorkflowCanvasNode,
): DataWorkflowCanvasGraph {
  const previous = graph.nodes.find((node) => node.id === nextNode.id);
  if (previous === undefined) return graph;
  const nodes = graph.nodes.map((node) => (node.id === nextNode.id ? nextNode : node));
  if (previous.type !== 'CONDITIONAL_SPLIT' || nextNode.type !== 'CONDITIONAL_SPLIT') {
    return { ...graph, nodes };
  }
  const validPorts = new Set(nextNode.branches.map((branch) => branch.id));
  return {
    nodes,
    edges: graph.edges.filter(
      (edge) => edge.sourceNodeId !== nextNode.id || validPorts.has(edge.sourcePortId),
    ),
  };
}

export function toWorkflowGraphDto(graph: DataWorkflowCanvasGraph): DataWorkflowGraphDto {
  return {
    nodes: graph.nodes.map((node) => {
      switch (node.type) {
        case 'TRIGGER':
          return node.trigger.type === 'MANUAL'
            ? { id: node.id, type: node.type, position: { ...node.position } }
            : {
                id: node.id,
                type: node.type,
                config: { ...node.trigger },
                position: { ...node.position },
              };
        case 'PIPELINE':
          return {
            id: node.id,
            type: node.type,
            pipelineId: node.pipelineId,
            versionNumber: node.versionNumber,
            position: { ...node.position },
          };
        case 'CONDITIONAL_SPLIT':
          return {
            id: node.id,
            type: node.type,
            mode: node.mode,
            ...(node.conditionKind === 'RUN_DATA' ? { conditionKind: 'RUN_DATA' } : {}),
            branches: node.branches,
            position: { ...node.position },
          };
        case 'PARALLEL_SPLIT':
        case 'JOIN':
        case 'PIPELINE_OUTCOME':
          return { id: node.id, type: node.type, position: { ...node.position } };
      }
    }),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function fromWorkflowGraphDto(value: unknown): DataWorkflowCanvasGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return createManualWorkflowDraft().graph;
  }
  const nodes = value.nodes.flatMap((node, index) => fromNodeDto(node, index));
  const edges = value.edges.flatMap((edge) => (isEdge(edge) ? [{ ...edge }] : []));
  return nodes.length === 0 ? createManualWorkflowDraft().graph : { nodes, edges };
}

export function validateSchedule(trigger: DataWorkflowTrigger): string | undefined {
  if (trigger.type === 'MANUAL') return undefined;
  if (trigger.type === 'WATCH_SOURCE') return undefined;
  if (trigger.type === 'CALENDAR') {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(trigger.timeOfDay)) {
      return 'Choose a valid time in 24-hour format.';
    }
    if (trigger.weekdays.length === 0) return 'Choose at least one day.';
    if (
      new Set(trigger.weekdays).size !== trigger.weekdays.length ||
      trigger.weekdays.some((weekday) => !isWorkflowWeekday(weekday))
    ) {
      return 'Choose each calendar day at most once.';
    }
    if (!isIanaTimezone(trigger.timezone)) return 'Choose a valid IANA timezone.';
    return undefined;
  }
  if (!Number.isInteger(trigger.everySeconds) || trigger.everySeconds < 10) {
    return 'Interval must be a whole number of at least 10 seconds.';
  }
  if (!isUtcInstant(trigger.anchorAt)) return 'Interval anchor must be a valid UTC timestamp.';
  return undefined;
}

export function validateTrigger(trigger: DataWorkflowTrigger): string | undefined {
  const scheduleError = validateSchedule(trigger);
  if (scheduleError !== undefined) return scheduleError;
  if (trigger.type !== 'WATCH_SOURCE') return undefined;
  if (!trigger.databaseServiceId.trim()) return 'Choose a verified database service.';
  if (trigger.relations.length === 0) return 'Add at least one source table to watch.';
  if (trigger.relations.some((relation) => !relation.schema.trim() || !relation.table.trim())) {
    return 'Every watched table needs a schema and table name.';
  }
  if (trigger.mode === 'POLLING') {
    if (!Number.isInteger(trigger.everySeconds) || trigger.everySeconds < 10) {
      return 'Polling interval must be a whole number of at least 10 seconds.';
    }
    for (const relation of trigger.relations) {
      if (!relation.cursor.changeColumn.trim() || !relation.cursor.tieBreakerColumn.trim()) {
        return 'Choose a change column and a tie-breaker column for every table.';
      }
      if (relation.cursor.changeColumn === relation.cursor.tieBreakerColumn) {
        return 'The change column and tie-breaker column must be different.';
      }
    }
    return undefined;
  }
  if (
    !Number.isInteger(trigger.aggregationWindowSeconds) ||
    trigger.aggregationWindowSeconds < 1 ||
    trigger.aggregationWindowSeconds > 300
  ) {
    return 'CDC aggregation window must be between 1 and 300 seconds.';
  }
  if (trigger.changeTypes.length === 0) return 'Choose at least one CDC change type.';
  if (new Set(trigger.changeTypes).size !== trigger.changeTypes.length) {
    return 'Choose each CDC change type at most once.';
  }
  return undefined;
}

function fromNodeDto(value: unknown, index: number): readonly DataWorkflowCanvasNode[] {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return [];
  const position = fromNodePosition(value.position, index);
  switch (value.type) {
    case 'TRIGGER':
      return [
        {
          id: value.id,
          type: 'TRIGGER',
          position,
          trigger: fromTriggerConfig(value.config),
        },
      ];
    case 'PIPELINE':
      return typeof value.pipelineId === 'string' && typeof value.versionNumber === 'number'
        ? [
            {
              id: value.id,
              type: 'PIPELINE',
              position,
              pipelineId: value.pipelineId,
              versionNumber: value.versionNumber,
            },
          ]
        : [];
    case 'PARALLEL_SPLIT':
    case 'JOIN':
    case 'PIPELINE_OUTCOME':
      return [{ id: value.id, type: value.type, position }];
    case 'CONDITIONAL_SPLIT':
      return [
        value.conditionKind === 'RUN_DATA'
          ? {
              id: value.id,
              type: 'CONDITIONAL_SPLIT',
              position,
              conditionKind: 'RUN_DATA',
              mode: value.mode === 'ALL_MATCH' ? 'ALL_MATCH' : 'FIRST_MATCH',
              branches: Array.isArray(value.branches)
                ? (value.branches as readonly DataWorkflowRunDataBranch[])
                : [],
            }
          : {
              id: value.id,
              type: 'CONDITIONAL_SPLIT',
              position,
              mode: value.mode === 'ALL_MATCH' ? 'ALL_MATCH' : 'FIRST_MATCH',
              branches: Array.isArray(value.branches)
                ? (value.branches as readonly DataWorkflowBranch[])
                : [],
            },
      ];
    default:
      return [];
  }
}

function fromNodePosition(value: unknown, index: number): DataWorkflowCanvasPosition {
  if (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  ) {
    return { x: value.x, y: value.y };
  }
  return { x: 48 + (index % 4) * 250, y: 120 + Math.floor(index / 4) * 180 };
}

function fromTriggerConfig(value: unknown): DataWorkflowTrigger {
  if (!isRecord(value)) return { type: 'MANUAL' };
  if (
    value.type === 'CALENDAR' &&
    typeof value.timeOfDay === 'string' &&
    isWorkflowWeekdays(value.weekdays) &&
    typeof value.timezone === 'string'
  ) {
    return {
      type: 'CALENDAR',
      timeOfDay: value.timeOfDay,
      weekdays: value.weekdays,
      timezone: value.timezone,
    };
  }
  if (
    value.type === 'INTERVAL' &&
    typeof value.everySeconds === 'number' &&
    typeof value.anchorAt === 'string'
  ) {
    return { type: 'INTERVAL', everySeconds: value.everySeconds, anchorAt: value.anchorAt };
  }
  if (
    value.type === 'WATCH_SOURCE' &&
    value.mode === 'POLLING' &&
    typeof value.databaseServiceId === 'string' &&
    typeof value.everySeconds === 'number' &&
    Number.isInteger(value.everySeconds) &&
    isPollingRelations(value.relations)
  ) {
    return {
      type: 'WATCH_SOURCE',
      mode: 'POLLING',
      databaseServiceId: value.databaseServiceId,
      relations: value.relations,
      everySeconds: value.everySeconds,
    };
  }
  if (
    value.type === 'WATCH_SOURCE' &&
    value.mode === 'CDC' &&
    typeof value.databaseServiceId === 'string' &&
    typeof value.aggregationWindowSeconds === 'number' &&
    Number.isInteger(value.aggregationWindowSeconds) &&
    isCdcRelations(value.relations) &&
    isWatchSourceChangeTypes(value.changeTypes)
  ) {
    return {
      type: 'WATCH_SOURCE',
      mode: 'CDC',
      databaseServiceId: value.databaseServiceId,
      aggregationWindowSeconds: value.aggregationWindowSeconds,
      relations: value.relations,
      changeTypes: value.changeTypes,
    };
  }
  return { type: 'MANUAL' };
}

function isPollingRelations(value: unknown): value is readonly {
  schema: string;
  table: string;
  cursor: { changeColumn: string; tieBreakerColumn: string };
}[] {
  return (
    Array.isArray(value) &&
    value.every(
      (relation) =>
        isRecord(relation) &&
        typeof relation.schema === 'string' &&
        typeof relation.table === 'string' &&
        isRecord(relation.cursor) &&
        typeof relation.cursor.changeColumn === 'string' &&
        typeof relation.cursor.tieBreakerColumn === 'string',
    )
  );
}

function isCdcRelations(value: unknown): value is readonly { schema: string; table: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (relation) =>
        isRecord(relation) &&
        typeof relation.schema === 'string' &&
        typeof relation.table === 'string',
    )
  );
}

function isWorkflowWeekdays(value: unknown): value is readonly DataWorkflowWatchSourceWeekday[] {
  return Array.isArray(value) && value.every(isWorkflowWeekday);
}

function isWorkflowWeekday(value: unknown): value is DataWorkflowWatchSourceWeekday {
  return (
    value === 'MON' ||
    value === 'TUE' ||
    value === 'WED' ||
    value === 'THU' ||
    value === 'FRI' ||
    value === 'SAT' ||
    value === 'SUN'
  );
}

function isWatchSourceChangeTypes(
  value: unknown,
): value is readonly ('INSERT' | 'UPDATE' | 'DELETE')[] {
  return (
    Array.isArray(value) &&
    value.every(
      (changeType) => changeType === 'INSERT' || changeType === 'UPDATE' || changeType === 'DELETE',
    )
  );
}

function isEdge(value: unknown): value is DataWorkflowEdge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sourceNodeId === 'string' &&
    typeof value.sourcePortId === 'string' &&
    typeof value.targetNodeId === 'string' &&
    typeof value.targetPortId === 'string'
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function isUtcInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

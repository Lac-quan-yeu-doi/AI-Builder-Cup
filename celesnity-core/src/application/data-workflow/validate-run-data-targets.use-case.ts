import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowTargetSchemaReader } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';
import type { WorkflowPipelineTargetSchema } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import type {
  WorkflowGraph,
  WorkflowRunDataPredicate,
} from '@domain/data-workflow/models/workflow-graph';
import type { WorkflowGraphValidationIssue } from '@domain/data-workflow/models/workflow-graph';
import { EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS } from '@domain/execution-orchestration/models/execution-output-facts';

const NUMERIC_TYPES = new Set([
  'byte',
  'short',
  'int',
  'integer',
  'long',
  'bigint',
  'float',
  'double',
  'decimal',
  'numeric',
]);
const STRING_TYPES = new Set(['string', 'char', 'character', 'varchar', 'text', 'uuid']);
const DATE_TYPES = new Set(['date', 'timestamp', 'timestamp_ntz']);
const BOOLEAN_TYPES = new Set(['boolean', 'bool']);
interface PipelineConditionPlanSize {
  readonly targetNodeIds: Set<string>;
  readonly splitNodeIds: Set<string>;
  predicateCount: number;
}

/** Validates run-data predicates against schemas from the pipeline's immutable version. */
export class ValidateRunDataTargetsUseCase {
  public constructor(
    private readonly access: IWorkflowAccess,
    private readonly targets: IWorkflowTargetSchemaReader,
  ) {}

  public async execute(actor: WorkflowActor, graph: WorkflowGraph): Promise<void> {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const issues: WorkflowGraphValidationIssue[] = [];
    const schemasByPipeline = new Map<string, readonly WorkflowPipelineTargetSchema[]>();
    const planSizesByPipelineNode = new Map<string, PipelineConditionPlanSize>();

    for (const split of graph.nodes) {
      if (split.type !== 'CONDITIONAL_SPLIT' || split.conditionKind !== 'RUN_DATA') continue;
      const incoming = graph.edges.filter((edge) => edge.targetNodeId === split.id);
      const source = incoming.length === 1 ? nodes.get(incoming[0]?.sourceNodeId ?? '') : undefined;
      if (source?.type !== 'PIPELINE') {
        issues.push(issue('RUN_DATA_PIPELINE_REQUIRED', split.id));
        continue;
      }

      const reference = { pipelineId: source.pipelineId, versionNumber: source.versionNumber };
      const key = `${reference.pipelineId}:${String(reference.versionNumber)}`;
      let schemas = schemasByPipeline.get(key);
      if (schemas === undefined) {
        await this.access.requirePipeline(actor, reference);
        schemas = await this.targets.describe(reference);
        schemasByPipeline.set(key, schemas);
      }

      for (const branch of split.branches) {
        if (!('runDataCondition' in branch)) continue;
        const condition = branch.runDataCondition;
        const planSize = planSizesByPipelineNode.get(source.id) ?? {
          targetNodeIds: new Set<string>(),
          splitNodeIds: new Set<string>(),
          predicateCount: 0,
        };
        planSize.targetNodeIds.add(condition.targetNodeId);
        planSize.splitNodeIds.add(split.id);
        planSize.predicateCount += 1;
        planSizesByPipelineNode.set(source.id, planSize);
        if (
          condition.targetNodeId.length >
            EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxIdentifierLength ||
          branch.id.length > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxIdentifierLength ||
          condition.predicate.column.length >
            EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxIdentifierLength
        ) {
          issues.push(issue('RUN_DATA_PREDICATE_INVALID', split.id));
          continue;
        }
        const target = schemas.find(
          (candidate) => candidate.targetNodeId === condition.targetNodeId,
        );
        if (target === undefined || target.schemaStatus !== 'KNOWN') {
          issues.push(issue('RUN_DATA_TARGET_SCHEMA_UNAVAILABLE', split.id));
          continue;
        }
        const column = target.columns.find(
          (candidate) => candidate.id === condition.predicate.column,
        );
        if (column === undefined) {
          issues.push(issue('RUN_DATA_COLUMN_NOT_FOUND', split.id));
          continue;
        }
        if (!isCompatible(column.type, condition.predicate)) {
          issues.push(issue('RUN_DATA_PREDICATE_INVALID', split.id));
        }
      }
    }

    for (const planSize of planSizesByPipelineNode.values()) {
      if (
        planSize.targetNodeIds.size <= EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxTargets &&
        planSize.predicateCount <= EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxPredicates
      ) {
        continue;
      }
      for (const splitNodeId of planSize.splitNodeIds) {
        issues.push(issue('RUN_DATA_PLAN_LIMIT_EXCEEDED', splitNodeId));
      }
    }

    if (issues.length > 0) throw WorkflowAuthoringError.invalidGraph(issues);
  }
}

function issue(code: string, nodeId: string): WorkflowGraphValidationIssue {
  return { code, nodeId };
}

function isCompatible(type: string, predicate: WorkflowRunDataPredicate): boolean {
  const normalized = normalizeType(type);
  if (predicate.operator === 'IS_EMPTY' || predicate.operator === 'IS_NOT_EMPTY') {
    return STRING_TYPES.has(normalized);
  }
  if (!('value' in predicate)) return false;
  if (
    typeof predicate.value === 'string' &&
    predicate.value.length > EXECUTION_OUTPUT_CONDITION_PLAN_LIMITS.maxStringValueLength
  ) {
    return false;
  }

  if (
    predicate.operator === 'GT' ||
    predicate.operator === 'GTE' ||
    predicate.operator === 'LT' ||
    predicate.operator === 'LTE'
  ) {
    if (NUMERIC_TYPES.has(normalized)) {
      return typeof predicate.value === 'number' && Number.isFinite(predicate.value);
    }
    return DATE_TYPES.has(normalized) && isIsoDate(predicate.value);
  }

  if (NUMERIC_TYPES.has(normalized)) {
    return typeof predicate.value === 'number' && Number.isFinite(predicate.value);
  }
  if (STRING_TYPES.has(normalized)) return typeof predicate.value === 'string';
  if (DATE_TYPES.has(normalized)) return isIsoDate(predicate.value);
  if (BOOLEAN_TYPES.has(normalized)) return typeof predicate.value === 'boolean';
  return false;
}

function normalizeType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized.startsWith('decimal(')) return 'decimal';
  if (normalized.startsWith('numeric(')) return 'numeric';
  if (normalized.startsWith('varchar(')) return 'varchar';
  if (normalized.startsWith('char(')) return 'char';
  if (normalized.startsWith('timestamp(')) return 'timestamp';
  if (normalized.startsWith('timestamp_ntz(')) return 'timestamp_ntz';
  return normalized;
}

function isIsoDate(value: string | number | boolean | null): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

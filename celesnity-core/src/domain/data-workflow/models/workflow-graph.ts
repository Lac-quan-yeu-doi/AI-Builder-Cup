export type Scalar = string | number | boolean | null;

export type Condition =
  | {
      readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
      readonly path: readonly string[];
      readonly value: Scalar;
    }
  | {
      readonly op: 'all' | 'any';
      readonly conditions: readonly Condition[];
    };

export interface ConditionContext {
  readonly [key: string]: Scalar | ConditionContext;
}

export interface WorkflowGraphEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
}

export interface WorkflowCanvasPosition {
  readonly x: number;
  readonly y: number;
}

interface WorkflowGraphNodeBase {
  readonly id: string;
  /** Optional authoring metadata. Workflow execution does not depend on canvas coordinates. */
  readonly position?: WorkflowCanvasPosition;
}

export interface WorkflowTriggerNode extends WorkflowGraphNodeBase {
  readonly type: 'TRIGGER';
  /** Omitted means the workflow is started manually only. */
  readonly config?: WorkflowTrigger;
}

export interface WorkflowPipelineNode extends WorkflowGraphNodeBase {
  readonly type: 'PIPELINE';
  readonly pipelineId: string;
  readonly versionNumber: number;
}

export interface WorkflowPipelineOutcomeNode extends WorkflowGraphNodeBase {
  readonly type: 'PIPELINE_OUTCOME';
}

export interface WorkflowParallelSplitNode extends WorkflowGraphNodeBase {
  readonly type: 'PARALLEL_SPLIT';
}

export interface WorkflowConditionalBranch {
  readonly id: string;
  readonly condition: Condition;
}

export type WorkflowRunDataPredicate =
  | {
      readonly column: string;
      readonly operator: 'EQ' | 'NE';
      readonly value: Scalar;
    }
  | {
      readonly column: string;
      readonly operator: 'GT' | 'GTE' | 'LT' | 'LTE';
      readonly value: string | number;
    }
  | {
      readonly column: string;
      readonly operator: 'IS_EMPTY' | 'IS_NOT_EMPTY';
    };

export interface WorkflowRunDataCountCondition {
  readonly operator: 'GTE' | 'GT' | 'EQ' | 'LT';
  readonly threshold: number;
}

export type WorkflowRunDataCondition =
  | {
      readonly targetNodeId: string;
      readonly quantifier: 'ANY' | 'ALL';
      readonly predicate: WorkflowRunDataPredicate;
    }
  | {
      readonly targetNodeId: string;
      readonly quantifier: 'COUNT';
      readonly predicate: WorkflowRunDataPredicate;
      readonly count: WorkflowRunDataCountCondition;
    };

export interface WorkflowRunDataConditionalBranch {
  readonly id: string;
  readonly runDataCondition: WorkflowRunDataCondition;
}

/** A final branch selected only when no conditional branch evaluates to true. */
export interface WorkflowConditionalFallbackBranch {
  readonly id: string;
  readonly fallback: true;
}

export type WorkflowConditionalBranchDefinition =
  WorkflowConditionalBranch | WorkflowRunDataConditionalBranch | WorkflowConditionalFallbackBranch;

export type WorkflowLegacyConditionalBranchDefinition =
  WorkflowConditionalBranch | WorkflowConditionalFallbackBranch;

export type WorkflowRunDataConditionalBranchDefinition =
  WorkflowRunDataConditionalBranch | WorkflowConditionalFallbackBranch;

interface WorkflowConditionalSplitNodeBase extends WorkflowGraphNodeBase {
  readonly type: 'CONDITIONAL_SPLIT';
  readonly mode: 'FIRST_MATCH' | 'ALL_MATCH';
}

/** Historical condition-context split. Missing conditionKind is intentionally legacy. */
export interface WorkflowLegacyConditionalSplitNode extends WorkflowConditionalSplitNodeBase {
  readonly conditionKind?: undefined;
  readonly branches: readonly WorkflowLegacyConditionalBranchDefinition[];
}

/** Evaluates bounded facts for rows produced by the directly connected pipeline execution. */
export interface WorkflowRunDataConditionalSplitNode extends WorkflowConditionalSplitNodeBase {
  readonly conditionKind: 'RUN_DATA';
  readonly branches: readonly WorkflowRunDataConditionalBranchDefinition[];
}

export type WorkflowConditionalSplitNode =
  WorkflowLegacyConditionalSplitNode | WorkflowRunDataConditionalSplitNode;

export interface WorkflowJoinNode extends WorkflowGraphNodeBase {
  readonly type: 'JOIN';
}

export type WorkflowGraphNode =
  | WorkflowTriggerNode
  | WorkflowPipelineNode
  | WorkflowPipelineOutcomeNode
  | WorkflowParallelSplitNode
  | WorkflowConditionalSplitNode
  | WorkflowJoinNode;

export interface WorkflowGraph {
  readonly nodes: readonly WorkflowGraphNode[];
  readonly edges: readonly WorkflowGraphEdge[];
}

export interface WorkflowGraphValidationIssue {
  readonly code: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
}
import type { WorkflowTrigger } from '@domain/data-workflow/models/workflow-trigger';

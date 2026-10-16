import type {
  Condition,
  WorkflowConditionalBranchDefinition,
  WorkflowConditionalFallbackBranch,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphValidationIssue,
  WorkflowRunDataCondition,
} from '@domain/data-workflow/models/workflow-graph';

function isFallbackBranch(
  branch: WorkflowConditionalBranchDefinition,
): branch is WorkflowConditionalFallbackBranch {
  return 'fallback' in branch && branch.fallback === true;
}

function exposesSourcePort(node: WorkflowGraphNode, portId: string): boolean {
  if (node.type === 'PIPELINE_OUTCOME') {
    return portId === 'success' || portId === 'error';
  }
  if (node.type === 'CONDITIONAL_SPLIT') {
    return node.branches.some((branch) => branch.id === portId);
  }
  return portId === 'out';
}

function exposesTargetPort(_node: WorkflowGraphNode, portId: string): boolean {
  return portId === 'in';
}

function hasDirectedPath(
  sourceNodeId: string,
  targetNodeId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
): boolean {
  const visited = new Set<string>();
  const pending = [sourceNodeId];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    if (current === targetNodeId) {
      return true;
    }
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }

  return false;
}

function hasCycle(adjacency: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    for (const targetNodeId of adjacency.get(nodeId) ?? []) {
      if (visit(targetNodeId)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return [...adjacency.keys()].some(visit);
}

function conditionPaths(condition: Condition): readonly (readonly string[])[] {
  if ('conditions' in condition) {
    return condition.conditions.flatMap(conditionPaths);
  }
  return [condition.path];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonBlankText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function runDataConditionIsValid(condition: WorkflowRunDataCondition): boolean {
  const raw = condition as unknown as Readonly<Record<string, unknown>>;
  if (!hasNonBlankText(raw.targetNodeId)) return false;
  if (raw.quantifier !== 'ANY' && raw.quantifier !== 'ALL' && raw.quantifier !== 'COUNT') {
    return false;
  }
  if (!isRecord(raw.predicate) || !hasNonBlankText(raw.predicate.column)) return false;

  const predicate = raw.predicate;
  const equalityOperator = predicate.operator === 'EQ' || predicate.operator === 'NE';
  const orderedOperator =
    predicate.operator === 'GT' ||
    predicate.operator === 'GTE' ||
    predicate.operator === 'LT' ||
    predicate.operator === 'LTE';
  const emptyOperator = predicate.operator === 'IS_EMPTY' || predicate.operator === 'IS_NOT_EMPTY';
  if (!equalityOperator && !orderedOperator && !emptyOperator) return false;
  const hasValue = Object.prototype.hasOwnProperty.call(predicate, 'value');
  if (equalityOperator && (!hasValue || !isScalar(predicate.value))) return false;
  if (
    orderedOperator &&
    (!hasValue ||
      (typeof predicate.value !== 'string' &&
        !(typeof predicate.value === 'number' && Number.isFinite(predicate.value))))
  ) {
    return false;
  }
  if (emptyOperator && hasValue) return false;

  const hasCount = Object.prototype.hasOwnProperty.call(raw, 'count');
  if (raw.quantifier !== 'COUNT') return !hasCount;
  if (!isRecord(raw.count)) return false;
  return (
    (raw.count.operator === 'GTE' ||
      raw.count.operator === 'GT' ||
      raw.count.operator === 'EQ' ||
      raw.count.operator === 'LT') &&
    typeof raw.count.threshold === 'number' &&
    Number.isSafeInteger(raw.count.threshold) &&
    raw.count.threshold >= 0
  );
}

function runDataConditionIssues(
  nodeId: string,
  branch: WorkflowConditionalBranchDefinition,
): WorkflowGraphValidationIssue[] {
  if (isFallbackBranch(branch)) return [];
  if (!('runDataCondition' in branch) || !runDataConditionIsValid(branch.runDataCondition)) {
    return [{ code: 'RUN_DATA_CONDITION_INVALID', nodeId }];
  }
  return [];
}

export function validateWorkflowGraph(
  graph: WorkflowGraph,
): readonly WorkflowGraphValidationIssue[] {
  const issues: WorkflowGraphValidationIssue[] = [];
  const nodesById = new Map<string, (typeof graph.nodes)[number]>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE_ID', nodeId: node.id });
      continue;
    }
    nodesById.set(node.id, node);
  }

  for (const node of nodesById.values()) {
    if (node.type !== 'CONDITIONAL_SPLIT') {
      continue;
    }
    const branchIds = new Set<string>();
    let fallbackSeen = false;
    for (const [index, branch] of node.branches.entries()) {
      if (branchIds.has(branch.id)) {
        issues.push({ code: 'DUPLICATE_BRANCH_ID', nodeId: node.id });
      }
      branchIds.add(branch.id);
      if (!isFallbackBranch(branch)) continue;
      if (fallbackSeen) {
        issues.push({ code: 'DUPLICATE_FALLBACK_BRANCH', nodeId: node.id });
      }
      fallbackSeen = true;
      if (index !== node.branches.length - 1) {
        issues.push({ code: 'FALLBACK_BRANCH_NOT_LAST', nodeId: node.id });
      }
    }
  }

  const runDataBranchOwner = new Map<string, string>();
  for (const node of nodesById.values()) {
    if (node.type !== 'CONDITIONAL_SPLIT' || node.conditionKind !== 'RUN_DATA') continue;
    for (const branch of node.branches) {
      const ownerNodeId = runDataBranchOwner.get(branch.id);
      if (ownerNodeId !== undefined && ownerNodeId !== node.id) {
        issues.push({ code: 'RUN_DATA_BRANCH_ID_DUPLICATE', nodeId: node.id });
      } else if (ownerNodeId === undefined) {
        runDataBranchOwner.set(branch.id, node.id);
      }
    }
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: 'DUPLICATE_EDGE_ID', edgeId: edge.id });
    }
    edgeIds.add(edge.id);
  }

  const triggerIds = graph.nodes.filter((node) => node.type === 'TRIGGER').map((node) => node.id);
  if (triggerIds.length !== 1) {
    issues.push({ code: 'TRIGGER_COUNT_INVALID' });
  }

  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const directIncomingEdges = new Map<string, WorkflowGraphEdge[]>();
  for (const nodeId of nodesById.keys()) {
    adjacency.set(nodeId, []);
    incoming.set(nodeId, 0);
    directIncomingEdges.set(nodeId, []);
  }

  for (const edge of graph.edges) {
    const sourceNode = nodesById.get(edge.sourceNodeId);
    const targetNode = nodesById.get(edge.targetNodeId);
    if (sourceNode === undefined || targetNode === undefined) {
      issues.push({ code: 'DANGLING_EDGE', edgeId: edge.id });
      continue;
    }
    if (targetNode.type === 'PIPELINE_OUTCOME' && sourceNode.type !== 'PIPELINE') {
      issues.push({ code: 'OUTCOME_INPUT_NOT_PIPELINE', edgeId: edge.id });
    }
    if (sourceNode.type === 'PIPELINE_OUTCOME' && targetNode.type !== 'PIPELINE') {
      issues.push({ code: 'OUTCOME_OUTPUT_NOT_PIPELINE', edgeId: edge.id });
    }
    const sourcePortValid = exposesSourcePort(sourceNode, edge.sourcePortId);
    const targetPortValid = exposesTargetPort(targetNode, edge.targetPortId);
    if (!sourcePortValid) {
      issues.push({ code: 'INVALID_SOURCE_PORT', edgeId: edge.id });
    }
    if (!targetPortValid) {
      issues.push({ code: 'INVALID_TARGET_PORT', edgeId: edge.id });
    }
    if (!sourcePortValid || !targetPortValid) {
      continue;
    }
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
    directIncomingEdges.get(edge.targetNodeId)?.push(edge);
  }

  if (hasCycle(adjacency)) {
    issues.push({ code: 'CYCLE_DETECTED' });
  }

  const triggerId = triggerIds.length === 1 ? triggerIds[0] : undefined;
  const reachableNodeIds = new Set<string>();
  if (triggerId !== undefined && nodesById.has(triggerId)) {
    const pending = [triggerId];
    while (pending.length > 0) {
      const nodeId = pending.pop();
      if (nodeId === undefined || reachableNodeIds.has(nodeId)) {
        continue;
      }
      reachableNodeIds.add(nodeId);
      pending.push(...(adjacency.get(nodeId) ?? []));
    }
  }

  for (const node of nodesById.values()) {
    if (node.type !== 'TRIGGER' && !reachableNodeIds.has(node.id)) {
      issues.push({ code: 'UNREACHABLE_NODE', nodeId: node.id });
    }
    if (
      node.type !== 'JOIN' &&
      node.type !== 'PIPELINE_OUTCOME' &&
      !(node.type === 'CONDITIONAL_SPLIT' && node.conditionKind === 'RUN_DATA') &&
      (incoming.get(node.id) ?? 0) > 1
    ) {
      issues.push({ code: 'ILLEGAL_FAN_IN', nodeId: node.id });
    }
    if (node.type === 'PIPELINE_OUTCOME' && (adjacency.get(node.id)?.length ?? 0) === 0) {
      issues.push({ code: 'OUTCOME_ROUTE_MISSING', nodeId: node.id });
    }
    if (node.type === 'CONDITIONAL_SPLIT' && node.conditionKind === 'RUN_DATA') {
      if ((adjacency.get(node.id)?.length ?? 0) === 0) {
        issues.push({ code: 'RUN_DATA_ROUTE_MISSING', nodeId: node.id });
      }
      if (!node.branches.some((branch) => !isFallbackBranch(branch))) {
        issues.push({ code: 'RUN_DATA_BRANCH_REQUIRED', nodeId: node.id });
      }
      const inputs = directIncomingEdges.get(node.id) ?? [];
      if (inputs.length !== 1) {
        issues.push({ code: 'RUN_DATA_INPUT_COUNT_INVALID', nodeId: node.id });
      } else {
        const inputEdge = inputs[0];
        if (inputEdge !== undefined && nodesById.get(inputEdge.sourceNodeId)?.type !== 'PIPELINE') {
          issues.push({ code: 'RUN_DATA_INPUT_NOT_PIPELINE', edgeId: inputEdge.id });
        }
      }
      for (const branch of node.branches) {
        issues.push(...runDataConditionIssues(node.id, branch));
      }
    }
  }

  for (const node of nodesById.values()) {
    if (node.type !== 'CONDITIONAL_SPLIT') {
      continue;
    }
    for (const branch of node.branches) {
      if (isFallbackBranch(branch)) continue;
      if (!('condition' in branch)) continue;
      for (const path of conditionPaths(branch.condition)) {
        const referencedNodeId = path[0];
        if (referencedNodeId === undefined || !nodesById.has(referencedNodeId)) {
          issues.push({ code: 'CONDITION_REFERENCE_UNAVAILABLE', nodeId: node.id });
          continue;
        }
        if (
          referencedNodeId === node.id ||
          !hasDirectedPath(referencedNodeId, node.id, adjacency)
        ) {
          issues.push({ code: 'CONDITION_REFERENCE_NOT_ANCESTOR', nodeId: node.id });
        }
      }
    }
  }

  return issues;
}

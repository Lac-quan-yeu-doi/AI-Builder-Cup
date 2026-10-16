import type {
  ConditionContext,
  WorkflowConditionalSplitNode,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowPipelineNode,
  WorkflowRunDataConditionalSplitNode,
} from '@domain/data-workflow/models/workflow-graph';
import type {
  WorkflowPipelineRunDataFacts,
  WorkflowRunDataTargetFacts,
} from '@domain/data-workflow/models/workflow-run-data-facts';
import type {
  DataWorkflowEdgeState,
  DataWorkflowNodeAttempt,
  WorkflowRunStatus,
} from '@domain/data-workflow/models/workflow-persistence';
import type { DependencyState } from '@domain/data-workflow/models/workflow-run-state';
import { evaluateCondition } from '@domain/data-workflow/services/evaluate-condition';
import { evaluateRunDataBranch } from '@domain/data-workflow/services/evaluate-run-data-branch';
import { resolveJoin } from '@domain/data-workflow/services/resolve-join';
import { resolvePipelineOutcome } from '@domain/data-workflow/services/resolve-pipeline-outcome';

export interface WorkflowTransitionPlanInput {
  readonly graph: WorkflowGraph;
  readonly organizationId: string;
  readonly runId: string;
  readonly nodeAttempts: readonly DataWorkflowNodeAttempt[];
  readonly edgeStates: readonly DataWorkflowEdgeState[];
  readonly triggerContext: ConditionContext;
  readonly parameters: ConditionContext;
  /** Bounded facts keyed by workflow Pipeline node ID; each entry is tied to one execution. */
  readonly runDataFacts?: Readonly<Record<string, WorkflowPipelineRunDataFacts>>;
  readonly now: Date;
  readonly nextId: () => string;
}

export interface PlannedNodeAttempt {
  readonly nodeId: string;
  readonly pipelineId: string;
  readonly versionNumber: number;
  readonly attemptNumber: number;
}

export interface WorkflowTransitionPlan {
  readonly status: WorkflowRunStatus;
  readonly nodeAttempts: readonly DataWorkflowNodeAttempt[];
  readonly edgeStates: readonly DataWorkflowEdgeState[];
  readonly eligiblePipelineNodes: readonly PlannedNodeAttempt[];
}

export function planWorkflowTransition(input: WorkflowTransitionPlanInput): WorkflowTransitionPlan {
  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node] as const));
  const outgoing = groupEdges(input.graph.edges, 'sourceNodeId');
  const incoming = groupEdges(input.graph.edges, 'targetNodeId');
  const latestAttempts = latestAttemptsByNode(input.nodeAttempts);
  const mutableEdges = new Map(input.edgeStates.map((edge) => [edge.edgeId, edge]));
  const eligible = new Map<string, PlannedNodeAttempt>();
  const cancelledPipeline = [...latestAttempts.values()].some(
    (attempt) => attempt.state === 'FAILED' && attempt.failureKind === 'CANCELLED',
  );
  const context = conditionContext(
    input.graph,
    input.nodeAttempts,
    input.triggerContext,
    input.parameters,
  );

  // A failed Pipeline may still be recoverable while its Outcome node waits
  // for other selected inputs. Once a failure is actually unhandled, stop all
  // new dispatches and terminalize work that has not reached an executor.
  const alreadySettledFailure = hasSettledUnhandledFailure(
    input.graph,
    latestAttempts,
    mutableEdges,
  );
  if (alreadySettledFailure) {
    suppressUndispatchedPipelines(input, latestAttempts, outgoing, mutableEdges);
    reconcileGraph(
      input,
      latestAttempts,
      incoming,
      outgoing,
      eligible,
      mutableEdges,
      context,
      false,
    );
  } else {
    reconcileGraph(
      input,
      latestAttempts,
      incoming,
      outgoing,
      eligible,
      mutableEdges,
      context,
      !cancelledPipeline,
    );

    if (hasSettledUnhandledFailure(input.graph, latestAttempts, mutableEdges)) {
      eligible.clear();
      suppressUndispatchedPipelines(input, latestAttempts, outgoing, mutableEdges);
      reconcileGraph(
        input,
        latestAttempts,
        incoming,
        outgoing,
        eligible,
        mutableEdges,
        context,
        false,
      );
    }
  }

  const attempts = input.nodeAttempts.map((attempt) => {
    const latest = latestAttempts.get(attempt.nodeId);
    return latest?.id === attempt.id ? latest : attempt;
  });
  for (const edge of mutableEdges.values()) {
    const targetNode = nodesById.get(edgeIdTarget(input.graph.edges, edge.edgeId));
    if (
      targetNode?.type === 'PIPELINE' &&
      edge.state === 'SKIPPED' &&
      !latestAttempts.has(targetNode.id)
    ) {
      latestAttempts.set(
        targetNode.id,
        skippedAttempt(targetNode.id, nextAttemptNumber(input.nodeAttempts, targetNode.id), input),
      );
    }
  }

  const plannedAttempts = [...latestAttempts.values()].filter(
    (attempt) => !input.nodeAttempts.some((existing) => existing.id === attempt.id),
  );
  attempts.push(...plannedAttempts);

  const status = resolveRunStatus(input.graph, latestAttempts, mutableEdges);

  return {
    status,
    nodeAttempts: attempts,
    edgeStates: [...mutableEdges.values()],
    eligiblePipelineNodes: status === 'FAILED' ? [] : [...eligible.values()],
  };
}

function reconcileGraph(
  input: WorkflowTransitionPlanInput,
  latestAttempts: Map<string, DataWorkflowNodeAttempt>,
  incoming: ReadonlyMap<string, readonly WorkflowGraphEdge[]>,
  outgoing: ReadonlyMap<string, readonly WorkflowGraphEdge[]>,
  eligible: Map<string, PlannedNodeAttempt>,
  edges: Map<string, DataWorkflowEdgeState>,
  context: ConditionContext,
  allowNewWork: boolean,
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of input.graph.nodes) {
      const inbound = incomingStates(incoming.get(node.id) ?? [], edges);
      switch (node.type) {
        case 'TRIGGER':
          changed = propagate(outgoing.get(node.id) ?? [], 'SUCCEEDED', input, edges) || changed;
          break;
        case 'PIPELINE':
          changed =
            planPipeline(
              node,
              inbound,
              latestAttempts,
              outgoing.get(node.id) ?? [],
              input,
              edges,
              eligible,
              allowNewWork,
            ) || changed;
          break;
        case 'PARALLEL_SPLIT':
          changed = planPassThrough(inbound, outgoing.get(node.id) ?? [], input, edges) || changed;
          break;
        case 'CONDITIONAL_SPLIT':
          changed =
            planConditional(
              node,
              inbound,
              outgoing.get(node.id) ?? [],
              context,
              latestAttempts,
              input,
              edges,
            ) || changed;
          break;
        case 'JOIN':
          changed = planJoin(inbound, outgoing.get(node.id) ?? [], input, edges) || changed;
          break;
        case 'PIPELINE_OUTCOME':
          changed =
            planOutcome(
              incoming.get(node.id) ?? [],
              inbound,
              latestAttempts,
              outgoing.get(node.id) ?? [],
              input,
              edges,
            ) || changed;
          break;
      }
    }
  }
}

function suppressUndispatchedPipelines(
  input: WorkflowTransitionPlanInput,
  latestAttempts: Map<string, DataWorkflowNodeAttempt>,
  outgoing: ReadonlyMap<string, readonly WorkflowGraphEdge[]>,
  edges: Map<string, DataWorkflowEdgeState>,
): void {
  const suppressedNodeIds = new Set<string>();
  for (const node of input.graph.nodes) {
    if (node.type !== 'PIPELINE') continue;
    const attempt = latestAttempts.get(node.id);
    if (attempt?.state === 'RUNNING' && attempt.executionId !== undefined) continue;
    if (attempt?.state === 'SUCCEEDED' || attempt?.state === 'FAILED') continue;

    latestAttempts.set(
      node.id,
      attempt === undefined
        ? skippedAttempt(node.id, nextAttemptNumber(input.nodeAttempts, node.id), input)
        : { ...attempt, state: 'SKIPPED', updatedAt: input.now },
    );
    suppressedNodeIds.add(node.id);
  }

  for (const nodeId of suppressedNodeIds) {
    propagatePending(outgoing.get(nodeId) ?? [], 'SKIPPED', input, edges);
  }
}

function propagatePending(
  outgoing: readonly WorkflowGraphEdge[],
  state: DependencyState,
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  let changed = false;
  for (const edge of outgoing) {
    const existing = edges.get(edge.id);
    if (existing !== undefined && existing.state !== 'PENDING') continue;
    changed = setEdge(edge, state, input, edges) || changed;
  }
  return changed;
}

function groupEdges(
  edges: readonly WorkflowGraphEdge[],
  key: 'sourceNodeId' | 'targetNodeId',
): Map<string, WorkflowGraphEdge[]> {
  const grouped = new Map<string, WorkflowGraphEdge[]>();
  for (const edge of edges) {
    const items = grouped.get(edge[key]) ?? [];
    items.push(edge);
    grouped.set(edge[key], items);
  }
  return grouped;
}

function latestAttemptsByNode(
  attempts: readonly DataWorkflowNodeAttempt[],
): Map<string, DataWorkflowNodeAttempt> {
  const latest = new Map<string, DataWorkflowNodeAttempt>();
  for (const attempt of attempts) {
    const existing = latest.get(attempt.nodeId);
    if (existing === undefined || attempt.attemptNumber > existing.attemptNumber) {
      latest.set(attempt.nodeId, attempt);
    }
  }
  return latest;
}

function incomingStates(
  edges: readonly WorkflowGraphEdge[],
  states: ReadonlyMap<string, DataWorkflowEdgeState>,
): readonly DependencyState[] {
  return edges.map((edge) => states.get(edge.id)?.state ?? 'PENDING');
}

function planPipeline(
  node: WorkflowPipelineNode,
  inbound: readonly DependencyState[],
  attempts: Map<string, DataWorkflowNodeAttempt>,
  outgoing: readonly WorkflowGraphEdge[],
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
  eligible: Map<string, PlannedNodeAttempt>,
  allowNewWork: boolean,
): boolean {
  const attempt = attempts.get(node.id);
  const reopened =
    allowNewWork && attempt?.state === 'SKIPPED' && inbound.some((state) => state !== 'SKIPPED');
  if (reopened) {
    // A retry may reopen downstream edges. Keep the historical skipped attempt
    // in persistence, but do not let it suppress a newly selected route.
    attempts.delete(node.id);
  }
  if (attempt !== undefined && !reopened) {
    if (
      attempt.state === 'SUCCEEDED' ||
      attempt.state === 'FAILED' ||
      attempt.state === 'SKIPPED'
    ) {
      return propagate(outgoing, attempt.state, input, edges);
    }
    if (attempt.executionId === undefined && !allowNewWork) {
      attempts.set(node.id, { ...attempt, state: 'SKIPPED', updatedAt: input.now });
      return propagate(outgoing, 'SKIPPED', input, edges);
    }
    if (attempt.executionId === undefined && allowNewWork) {
      eligible.set(node.id, {
        nodeId: node.id,
        pipelineId: node.pipelineId,
        versionNumber: node.versionNumber,
        attemptNumber: attempt.attemptNumber,
      });
    }
    return false;
  }

  if (inbound.length > 0 && inbound.every((state) => state === 'SKIPPED')) {
    attempts.set(
      node.id,
      skippedAttempt(node.id, nextAttemptNumber(input.nodeAttempts, node.id), input),
    );
    return propagate(outgoing, 'SKIPPED', input, edges);
  }
  if (inbound.includes('FAILED')) {
    return propagate(outgoing, 'FAILED', input, edges);
  }
  if (inbound.length === 0 || inbound.every((state) => state === 'SUCCEEDED')) {
    if (!allowNewWork) return false;
    const planned = {
      nodeId: node.id,
      pipelineId: node.pipelineId,
      versionNumber: node.versionNumber,
      attemptNumber: nextAttemptNumber(input.nodeAttempts, node.id),
    };
    attempts.set(node.id, {
      id: input.nextId(),
      organizationId: input.organizationId,
      runId: input.runId,
      nodeId: node.id,
      attemptNumber: planned.attemptNumber,
      state: 'RUNNING',
      createdAt: input.now,
      updatedAt: input.now,
    });
    eligible.set(node.id, planned);
    return true;
  }
  return false;
}

function planPassThrough(
  inbound: readonly DependencyState[],
  outgoing: readonly WorkflowGraphEdge[],
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  if (inbound.includes('FAILED')) return propagate(outgoing, 'FAILED', input, edges);
  if (inbound.length > 0 && inbound.every((state) => state === 'SKIPPED')) {
    return propagate(outgoing, 'SKIPPED', input, edges);
  }
  if (inbound.length === 0 || inbound.every((state) => state === 'SUCCEEDED')) {
    return propagate(outgoing, 'SUCCEEDED', input, edges);
  }
  return false;
}

function planConditional(
  node: WorkflowConditionalSplitNode,
  inbound: readonly DependencyState[],
  outgoing: readonly WorkflowGraphEdge[],
  context: ConditionContext,
  latestAttempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  if (inbound.includes('FAILED')) return propagate(outgoing, 'FAILED', input, edges);
  if (inbound.length > 0 && inbound.every((state) => state === 'SKIPPED')) {
    return propagate(outgoing, 'SKIPPED', input, edges);
  }
  if (!(inbound.length === 0 || inbound.every((state) => state === 'SUCCEEDED'))) return false;
  if (outgoing.every((edge) => edges.has(edge.id))) return false;

  const selected =
    node.conditionKind === 'RUN_DATA'
      ? selectRunDataBranches(node, input.graph.edges, latestAttempts, input.runDataFacts)
      : selectLegacyBranches(node, context);
  // Missing, stale, or invalid facts are an ambiguous result. Fail closed: do
  // not route customer work on a guessed false condition or retry the writer.
  if (selected === undefined) return propagate(outgoing, 'FAILED', input, edges);

  let changed = false;
  for (const edge of outgoing) {
    changed =
      setEdge(edge, selected.has(edge.sourcePortId) ? 'SUCCEEDED' : 'SKIPPED', input, edges) ||
      changed;
  }
  return changed;
}

function selectLegacyBranches(
  node: Exclude<WorkflowConditionalSplitNode, { readonly conditionKind: 'RUN_DATA' }>,
  context: ConditionContext,
): ReadonlySet<string> {
  const selected = new Set<string>();
  let fallbackBranchId: string | undefined;
  for (const branch of node.branches) {
    if ('fallback' in branch) {
      fallbackBranchId = branch.id;
      continue;
    }
    if (evaluateCondition(branch.condition, context)) {
      selected.add(branch.id);
      if (node.mode === 'FIRST_MATCH') break;
    }
  }
  if (selected.size === 0 && fallbackBranchId !== undefined) selected.add(fallbackBranchId);
  return selected;
}

function selectRunDataBranches(
  node: WorkflowRunDataConditionalSplitNode,
  graphEdges: readonly WorkflowGraphEdge[],
  latestAttempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  factsByPipelineNode: Readonly<Record<string, WorkflowPipelineRunDataFacts>> | undefined,
): ReadonlySet<string> | undefined {
  const inbound = graphEdges.filter((edge) => edge.targetNodeId === node.id);
  if (inbound.length !== 1) return undefined;
  const inputEdge = inbound[0];
  if (inputEdge === undefined) return undefined;
  const pipelineNodeId = inputEdge.sourceNodeId;
  const attempt = latestAttempts.get(pipelineNodeId);
  if (attempt?.state !== 'SUCCEEDED' || attempt.executionId === undefined) return undefined;
  const conditionBranchCount = node.branches.filter(
    (branch) => 'runDataCondition' in branch,
  ).length;
  if (conditionBranchCount === 0) {
    const fallback = node.branches.find((branch) => 'fallback' in branch);
    return new Set(fallback === undefined ? [] : [fallback.id]);
  }
  if (
    !isRecord(factsByPipelineNode) ||
    !Object.prototype.hasOwnProperty.call(factsByPipelineNode, pipelineNodeId)
  ) {
    return undefined;
  }
  const pipelineFacts = factsByPipelineNode[pipelineNodeId];
  if (!isPipelineRunDataFacts(pipelineFacts) || pipelineFacts.executionId !== attempt.executionId) {
    return undefined;
  }

  const selected = new Set<string>();
  let fallbackBranchId: string | undefined;
  for (const branch of node.branches) {
    if ('fallback' in branch) {
      fallbackBranchId = branch.id;
      continue;
    }
    if (!('runDataCondition' in branch)) return undefined;
    const targetFacts = uniqueTargetFacts(pipelineFacts, branch.runDataCondition.targetNodeId);
    if (
      targetFacts === undefined ||
      targetFacts.matchesByBranchId === undefined ||
      typeof targetFacts.matchesByBranchId !== 'object' ||
      targetFacts.matchesByBranchId === null ||
      !Object.prototype.hasOwnProperty.call(targetFacts.matchesByBranchId, branch.id)
    ) {
      return undefined;
    }
    const matches = targetFacts.matchesByBranchId[branch.id];
    if (typeof matches !== 'number') return undefined;
    let matchesCondition: boolean;
    try {
      matchesCondition = evaluateRunDataBranch(branch, {
        totalRows: targetFacts.totalRows,
        matchingRows: matches,
      });
    } catch {
      return undefined;
    }
    if (matchesCondition) {
      if (node.mode === 'ALL_MATCH' || selected.size === 0) selected.add(branch.id);
    }
  }
  if (selected.size === 0 && fallbackBranchId !== undefined) selected.add(fallbackBranchId);
  return selected;
}

function uniqueTargetFacts(
  pipelineFacts: WorkflowPipelineRunDataFacts,
  targetNodeId: string,
): WorkflowRunDataTargetFacts | undefined {
  if (!Array.isArray(pipelineFacts.targets)) return undefined;
  const matching = pipelineFacts.targets.filter(
    (target: unknown): target is WorkflowRunDataTargetFacts =>
      isWorkflowRunDataTargetFacts(target) && target.targetNodeId === targetNodeId,
  );
  return matching.length === 1 ? matching[0] : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPipelineRunDataFacts(value: unknown): value is WorkflowPipelineRunDataFacts {
  return isRecord(value) && typeof value.executionId === 'string' && Array.isArray(value.targets);
}

function isWorkflowRunDataTargetFacts(value: unknown): value is WorkflowRunDataTargetFacts {
  return (
    isRecord(value) &&
    typeof value.targetNodeId === 'string' &&
    typeof value.totalRows === 'number' &&
    isRecord(value.matchesByBranchId)
  );
}

function planJoin(
  inbound: readonly DependencyState[],
  outgoing: readonly WorkflowGraphEdge[],
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  if (inbound.length === 0) return false;
  const decision = resolveJoin(inbound);
  if (decision === 'READY') return propagate(outgoing, 'SUCCEEDED', input, edges);
  if (decision === 'SKIP') return propagate(outgoing, 'SKIPPED', input, edges);
  if (decision === 'BLOCK') return propagate(outgoing, 'FAILED', input, edges);
  return false;
}

function planOutcome(
  incoming: readonly WorkflowGraphEdge[],
  inbound: readonly DependencyState[],
  attempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  outgoing: readonly WorkflowGraphEdge[],
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  // A failed dependency can block a pipeline before it ever executed. Such a
  // blocked pipeline is not a failed job whose Error route may recover it.
  if (
    incoming.some(
      (edge, index) =>
        inbound[index] === 'FAILED' &&
        (attempts.get(edge.sourceNodeId)?.state !== 'FAILED' ||
          attempts.get(edge.sourceNodeId)?.failureKind === 'CANCELLED'),
    )
  ) {
    return propagate(outgoing, 'FAILED', input, edges);
  }
  const decision = resolvePipelineOutcome(inbound);
  if (decision === 'WAIT') return false;
  const selected = decision === 'ERROR' ? 'error' : decision === 'SUCCESS' ? 'success' : undefined;
  let changed = false;
  for (const edge of outgoing) {
    changed =
      setEdge(edge, edge.sourcePortId === selected ? 'SUCCEEDED' : 'SKIPPED', input, edges) ||
      changed;
  }
  return changed;
}

function propagate(
  outgoing: readonly WorkflowGraphEdge[],
  state: DependencyState,
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  let changed = false;
  for (const edge of outgoing) changed = setEdge(edge, state, input, edges) || changed;
  return changed;
}

function setEdge(
  edge: WorkflowGraphEdge,
  state: DependencyState,
  input: WorkflowTransitionPlanInput,
  edges: Map<string, DataWorkflowEdgeState>,
): boolean {
  const existing = edges.get(edge.id);
  if (existing?.state === state) return false;
  edges.set(edge.id, {
    id: existing?.id ?? input.nextId(),
    organizationId: input.organizationId,
    runId: input.runId,
    edgeId: edge.id,
    state,
    updatedAt: input.now,
  });
  return true;
}

function skippedAttempt(
  nodeId: string,
  attemptNumber: number,
  input: WorkflowTransitionPlanInput,
): DataWorkflowNodeAttempt {
  return {
    id: input.nextId(),
    organizationId: input.organizationId,
    runId: input.runId,
    nodeId,
    attemptNumber,
    state: 'SKIPPED',
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function nextAttemptNumber(attempts: readonly DataWorkflowNodeAttempt[], nodeId: string): number {
  return (
    attempts
      .filter((attempt) => attempt.nodeId === nodeId)
      .reduce((max, attempt) => Math.max(max, attempt.attemptNumber), 0) + 1
  );
}

function conditionContext(
  graph: WorkflowGraph,
  attempts: readonly DataWorkflowNodeAttempt[],
  trigger: ConditionContext,
  parameters: ConditionContext,
): ConditionContext {
  const nodes: Record<string, ConditionContext> = {};
  for (const attempt of attempts) {
    nodes[attempt.nodeId] = {
      status: attempt.state,
      executionId: attempt.executionId ?? null,
    };
  }
  const triggerNode = graph.nodes.find((node) => node.type === 'TRIGGER');
  if (triggerNode !== undefined) {
    nodes[triggerNode.id] = { ...trigger, status: 'SUCCEEDED' };
  }
  return { trigger, parameters, ...nodes };
}

function edgeIdTarget(edges: readonly WorkflowGraphEdge[], edgeId: string): string {
  return edges.find((edge) => edge.id === edgeId)?.targetNodeId ?? '';
}

function resolveRunStatus(
  graph: WorkflowGraph,
  attempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  edges: ReadonlyMap<string, DataWorkflowEdgeState>,
): WorkflowRunStatus {
  if ([...attempts.values()].some((attempt) => attempt.state === 'RUNNING')) return 'RUNNING';
  if (hasUnhandledFailure(graph, attempts, edges)) return 'FAILED';

  const pipelineNodes = graph.nodes.filter(
    (node): node is WorkflowPipelineNode => node.type === 'PIPELINE',
  );
  const terminal = pipelineNodes.every((node) => {
    const attempt = attempts.get(node.id);
    return (
      attempt?.state === 'SUCCEEDED' || attempt?.state === 'SKIPPED' || attempt?.state === 'FAILED'
    );
  });
  return terminal ? 'SUCCEEDED' : 'RUNNING';
}

function hasUnhandledFailure(
  graph: WorkflowGraph,
  attempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  states: ReadonlyMap<string, DataWorkflowEdgeState>,
): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = groupEdges(graph.edges, 'sourceNodeId');
  // A failed edge remains in history. Only its direct Outcome consumer with a
  // selected, connected Error route absorbs it. Downstream failures are checked
  // independently, and running downstream attempts keep the run active.
  const handled = (edge: WorkflowGraphEdge): boolean =>
    nodes.get(edge.targetNodeId)?.type === 'PIPELINE_OUTCOME' &&
    (outgoing.get(edge.targetNodeId) ?? []).some(
      (route) => route.sourcePortId === 'error' && states.get(route.id)?.state === 'SUCCEEDED',
    );
  for (const attempt of attempts.values()) {
    if (attempt.state !== 'FAILED') continue;
    const routes = outgoing.get(attempt.nodeId) ?? [];
    if (routes.length === 0 || !routes.every(handled)) return true;
  }
  return graph.edges.some((edge) => states.get(edge.id)?.state === 'FAILED' && !handled(edge));
}

function hasSettledUnhandledFailure(
  graph: WorkflowGraph,
  attempts: ReadonlyMap<string, DataWorkflowNodeAttempt>,
  states: ReadonlyMap<string, DataWorkflowEdgeState>,
): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const incoming = groupEdges(graph.edges, 'targetNodeId');
  const outgoing = groupEdges(graph.edges, 'sourceNodeId');
  const handled = (edge: WorkflowGraphEdge): boolean =>
    nodes.get(edge.targetNodeId)?.type === 'PIPELINE_OUTCOME' &&
    (outgoing.get(edge.targetNodeId) ?? []).some(
      (route) => route.sourcePortId === 'error' && states.get(route.id)?.state === 'SUCCEEDED',
    );
  const outcomeIsWaitingToRoute = (edge: WorkflowGraphEdge): boolean => {
    const outcome = nodes.get(edge.targetNodeId);
    const sourceAttempt = attempts.get(edge.sourceNodeId);
    if (
      outcome?.type !== 'PIPELINE_OUTCOME' ||
      sourceAttempt?.state !== 'FAILED' ||
      sourceAttempt.failureKind === 'CANCELLED'
    ) {
      return false;
    }
    const inputs = incoming.get(outcome.id) ?? [];
    return resolvePipelineOutcome(incomingStates(inputs, states)) === 'WAIT';
  };
  const unresolvedOrHandled = (edge: WorkflowGraphEdge): boolean =>
    handled(edge) || outcomeIsWaitingToRoute(edge);

  for (const attempt of attempts.values()) {
    if (attempt.state !== 'FAILED') continue;
    const routes = outgoing.get(attempt.nodeId) ?? [];
    if (routes.length === 0 || !routes.every(unresolvedOrHandled)) return true;
  }

  return graph.edges.some(
    (edge) => states.get(edge.id)?.state === 'FAILED' && !unresolvedOrHandled(edge),
  );
}

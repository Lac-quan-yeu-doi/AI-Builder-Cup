import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelineExecutor } from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputPredicate,
} from '@domain/execution-orchestration/models/execution-output-facts';
import type { WorkflowPipelineRunDataFacts } from '@domain/data-workflow/models/workflow-run-data-facts';
import type { ConditionContext, WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import type { DataWorkflowNodeAttempt } from '@domain/data-workflow/models/workflow-persistence';
import { planWorkflowTransition } from '@domain/data-workflow/services/plan-workflow-transition';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface AdvanceWorkflowRunInput {
  readonly runId: string;
  readonly leaseToken: string;
}

/** Reconciles one leased run. The planner remains pure; all I/O is kept here. */
export class AdvanceWorkflowRunService {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly executor: IWorkflowPipelineExecutor,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async tick(input: AdvanceWorkflowRunInput): Promise<void> {
    const snapshot = await this.runs.lockSnapshot(input.runId);
    if (snapshot === undefined) throw WorkflowRunError.notFound();
    const run = snapshot.run;
    const now = this.clock.now();
    if (
      run.status !== 'RUNNING' ||
      run.leaseToken !== input.leaseToken ||
      run.leaseOwner === undefined ||
      run.leaseExpiresAt === undefined ||
      run.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw WorkflowRunError.leaseMismatch();
    }
    const version = await this.workflows.findVersionById(run.versionId);
    if (
      version === undefined ||
      version.organizationId !== run.organizationId ||
      version.workflowId !== run.workflowId
    ) {
      throw WorkflowRunError.notFound();
    }

    const reconciled = await this.reconcileAttempts(
      snapshot.nodeAttempts,
      version.graph,
      snapshot.edgeStates,
      now,
    );
    const plan = planWorkflowTransition({
      graph: version.graph,
      organizationId: run.organizationId,
      runId: run.id,
      nodeAttempts: reconciled.nodeAttempts,
      edgeStates: snapshot.edgeStates,
      triggerContext: asConditionContext(run.triggerContext),
      parameters: asConditionContext(run.parameters),
      runDataFacts: reconciled.runDataFacts,
      now,
      nextId: () => this.ids.next(),
    });
    const saved = await this.runs.saveTransition(
      run,
      run.revision,
      {
        status: plan.status,
        leaseOwner: run.leaseOwner,
        leaseToken: run.leaseToken,
        leaseExpiresAt: run.leaseExpiresAt,
        updatedAt: now,
        nodeAttempts: plan.nodeAttempts,
        edgeStates: plan.edgeStates,
      },
      { owner: run.leaseOwner, token: input.leaseToken },
    );
    if (!saved) throw WorkflowRunError.revisionConflict();

    const actor: WorkflowActor = {
      organizationId: run.organizationId,
      identityId: run.actor,
    };
    for (const pipeline of plan.eligiblePipelineNodes) {
      try {
        const request = await this.executor.prepare(
          actor,
          {
            pipelineId: pipeline.pipelineId,
            versionNumber: pipeline.versionNumber,
          },
          outputConditionPlanForPipeline(version.graph, pipeline.nodeId),
        );
        await this.executor.enqueuePrepared(
          {
            organizationId: run.organizationId,
            runId: run.id,
            nodeId: pipeline.nodeId,
            attemptNumber: pipeline.attemptNumber,
            leaseOwner: run.leaseOwner,
            leaseToken: input.leaseToken,
          },
          request,
        );
      } catch (error) {
        await this.failUndispatchedAttempt(
          input,
          version.graph,
          pipeline.nodeId,
          pipeline.attemptNumber,
          error,
          now,
        );
      }
    }
  }

  private async failUndispatchedAttempt(
    input: AdvanceWorkflowRunInput,
    graph: WorkflowGraph,
    nodeId: string,
    attemptNumber: number,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const snapshot = await this.runs.lockSnapshot(input.runId);
    if (snapshot === undefined) throw WorkflowRunError.notFound();
    const run = snapshot.run;
    if (
      run.status !== 'RUNNING' ||
      run.leaseToken !== input.leaseToken ||
      run.leaseOwner === undefined ||
      run.leaseExpiresAt === undefined ||
      run.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw WorkflowRunError.leaseMismatch();
    }
    const attempt = snapshot.nodeAttempts.find(
      (candidate) => candidate.nodeId === nodeId && candidate.attemptNumber === attemptNumber,
    );
    // enqueuePrepared is atomic. If it committed before surfacing an error, the
    // execution association is authoritative and normal reconciliation owns it.
    if (attempt === undefined || attempt.state !== 'RUNNING' || attempt.executionId !== undefined) {
      return;
    }
    const failedAttempts = snapshot.nodeAttempts.map((candidate) =>
      candidate.id === attempt.id
        ? {
            ...candidate,
            state: 'FAILED' as const,
            error: secretRedactor.safeErrorMessage(error),
            updatedAt: now,
          }
        : candidate,
    );
    const failurePlan = planWorkflowTransition({
      graph,
      organizationId: run.organizationId,
      runId: run.id,
      nodeAttempts: failedAttempts,
      edgeStates: snapshot.edgeStates,
      triggerContext: asConditionContext(run.triggerContext),
      parameters: asConditionContext(run.parameters),
      runDataFacts: await this.readRunDataFacts(failedAttempts, graph, snapshot.edgeStates),
      now,
      nextId: () => this.ids.next(),
    });
    const saved = await this.runs.saveTransition(
      run,
      run.revision,
      {
        status: failurePlan.status,
        leaseOwner: run.leaseOwner,
        leaseToken: run.leaseToken,
        leaseExpiresAt: run.leaseExpiresAt,
        updatedAt: now,
        nodeAttempts: failurePlan.nodeAttempts,
        edgeStates: failurePlan.edgeStates,
      },
      { owner: run.leaseOwner, token: input.leaseToken },
    );
    if (!saved) throw WorkflowRunError.revisionConflict();
  }

  private async reconcileAttempts(
    attempts: readonly DataWorkflowNodeAttempt[],
    graph: WorkflowGraph,
    edgeStates: Parameters<typeof planWorkflowTransition>[0]['edgeStates'],
    now: Date,
  ): Promise<{
    readonly nodeAttempts: readonly DataWorkflowNodeAttempt[];
    readonly runDataFacts: Readonly<Record<string, WorkflowPipelineRunDataFacts>>;
  }> {
    const neededFacts = pipelineNodesNeedingRunDataFacts(graph, attempts, edgeStates);
    const latestAttempts = latestAttemptsByNode(attempts);
    const facts: Record<string, WorkflowPipelineRunDataFacts> = Object.create(null) as Record<
      string,
      WorkflowPipelineRunDataFacts
    >;
    const nodeAttempts = await Promise.all(
      attempts.map(async (attempt) => {
        if (attempt.executionId === undefined) return attempt;
        const latest = latestAttempts.get(attempt.nodeId);
        const needsPersistedFacts =
          latest?.attemptNumber === attempt.attemptNumber &&
          attempt.state === 'SUCCEEDED' &&
          neededFacts.has(attempt.nodeId);
        if (attempt.state !== 'RUNNING' && !needsPersistedFacts) return attempt;

        const result = await this.executor.readResult(attempt.executionId);
        if (
          result.status === 'SUCCEEDED' &&
          result.outputFacts !== undefined &&
          result.outputFacts.executionId === attempt.executionId
        ) {
          facts[attempt.nodeId] = {
            executionId: result.outputFacts.executionId,
            targets: result.outputFacts.targets,
          };
        }
        if (attempt.state !== 'RUNNING') return attempt;
        if (result.status === 'PENDING' || result.status === 'RUNNING') return attempt;
        return {
          ...attempt,
          state: result.status === 'SUCCEEDED' ? ('SUCCEEDED' as const) : ('FAILED' as const),
          error: workflowExecutionError(result, attempt.error),
          failureKind: result.status === 'CANCELLED' ? ('CANCELLED' as const) : undefined,
          updatedAt: now,
        };
      }),
    );
    return { nodeAttempts, runDataFacts: facts };
  }

  private async readRunDataFacts(
    attempts: readonly DataWorkflowNodeAttempt[],
    graph: WorkflowGraph,
    edgeStates: Parameters<typeof planWorkflowTransition>[0]['edgeStates'],
  ): Promise<Readonly<Record<string, WorkflowPipelineRunDataFacts>>> {
    const neededFacts = pipelineNodesNeedingRunDataFacts(graph, attempts, edgeStates);
    const latestAttempts = latestAttemptsByNode(attempts);
    const facts: Record<string, WorkflowPipelineRunDataFacts> = Object.create(null) as Record<
      string,
      WorkflowPipelineRunDataFacts
    >;
    await Promise.all(
      [...neededFacts].map(async (nodeId) => {
        const attempt = latestAttempts.get(nodeId);
        if (attempt?.state !== 'SUCCEEDED' || attempt.executionId === undefined) return;
        const result = await this.executor.readResult(attempt.executionId);
        if (
          result.status !== 'SUCCEEDED' ||
          result.outputFacts === undefined ||
          result.outputFacts.executionId !== attempt.executionId
        ) {
          return;
        }
        facts[nodeId] = {
          executionId: result.outputFacts.executionId,
          targets: result.outputFacts.targets,
        };
      }),
    );
    return facts;
  }
}

function workflowExecutionError(
  result: Awaited<ReturnType<IWorkflowPipelineExecutor['readResult']>>,
  existing: string | undefined,
): string | undefined {
  if (result.status === 'CANCELLED') return 'Pipeline execution was cancelled.';
  if (result.status === 'FAILED' && result.outputFactsError !== undefined) {
    return secretRedactor.safeErrorMessage(result.outputFactsError);
  }
  return existing;
}

function latestAttemptsByNode(
  attempts: readonly DataWorkflowNodeAttempt[],
): Map<string, DataWorkflowNodeAttempt> {
  const latest = new Map<string, DataWorkflowNodeAttempt>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.nodeId);
    if (current === undefined || attempt.attemptNumber > current.attemptNumber) {
      latest.set(attempt.nodeId, attempt);
    }
  }
  return latest;
}

function pipelineNodesNeedingRunDataFacts(
  graph: WorkflowGraph,
  attempts: readonly DataWorkflowNodeAttempt[],
  edgeStates: Parameters<typeof planWorkflowTransition>[0]['edgeStates'],
): ReadonlySet<string> {
  const latest = latestAttemptsByNode(attempts);
  const resolvedEdgeIds = new Set(edgeStates.map((edge) => edge.edgeId));
  const needed = new Set<string>();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));

  for (const node of graph.nodes) {
    if (node.type !== 'CONDITIONAL_SPLIT' || node.conditionKind !== 'RUN_DATA') continue;
    const outgoing = graph.edges.filter((edge) => edge.sourceNodeId === node.id);
    if (outgoing.length === 0 || outgoing.every((edge) => resolvedEdgeIds.has(edge.id))) continue;
    const inbound = graph.edges.filter((edge) => edge.targetNodeId === node.id);
    if (inbound.length !== 1) continue;
    const source = nodes.get(inbound[0]?.sourceNodeId ?? '');
    if (source?.type !== 'PIPELINE') continue;
    const attempt = latest.get(source.id);
    if (attempt?.state === 'SUCCEEDED' && attempt.executionId !== undefined) needed.add(source.id);
  }
  return needed;
}

function outputConditionPlanForPipeline(
  graph: WorkflowGraph,
  pipelineNodeId: string,
): ExecutionOutputConditionPlan | undefined {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const predicatesByTarget = new Map<string, ExecutionOutputPredicate[]>();

  for (const edge of graph.edges) {
    if (edge.sourceNodeId !== pipelineNodeId) continue;
    const split = nodes.get(edge.targetNodeId);
    if (split?.type !== 'CONDITIONAL_SPLIT' || split.conditionKind !== 'RUN_DATA') continue;
    for (const branch of split.branches) {
      if (!('runDataCondition' in branch)) continue;
      const { targetNodeId, predicate } = branch.runDataCondition;
      const predicates = predicatesByTarget.get(targetNodeId) ?? [];
      predicates.push({
        branchId: branch.id,
        column: predicate.column,
        operator: predicate.operator,
        ...('value' in predicate ? { value: predicate.value } : {}),
      });
      predicatesByTarget.set(targetNodeId, predicates);
    }
  }

  if (predicatesByTarget.size === 0) return undefined;
  return {
    targets: [...predicatesByTarget].map(([targetNodeId, predicates]) => ({
      targetNodeId,
      predicates,
    })),
  };
}

function asConditionContext(value: Readonly<Record<string, unknown>>): ConditionContext {
  return value as ConditionContext;
}

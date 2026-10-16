import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelineExecutor } from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface RetryWorkflowNodeInput {
  readonly actor: WorkflowActor;
  readonly runId: string;
  readonly nodeId: string;
  readonly expectedRevision: number;
  readonly acknowledgeWriteRisk: boolean;
}

export class RetryWorkflowNodeUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
    private readonly executor: IWorkflowPipelineExecutor,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async execute(input: RetryWorkflowNodeInput): Promise<void> {
    const snapshot = await this.runs.lockSnapshot(input.runId);
    if (snapshot === undefined || snapshot.run.organizationId !== input.actor.organizationId) {
      throw WorkflowRunError.notFound();
    }
    await this.access.require(input.actor, 'RUN', snapshot.run.workflowId);
    if (snapshot.run.revision !== input.expectedRevision) throw WorkflowRunError.revisionConflict();
    if (!input.acknowledgeWriteRisk) throw WorkflowRunError.retryAcknowledgementRequired();

    const version = await this.workflows.findVersionById(snapshot.run.versionId);
    if (version === undefined || version.workflowId !== snapshot.run.workflowId) {
      throw WorkflowRunError.notFound();
    }
    const pipeline = version.graph.nodes.find(
      (node) => node.id === input.nodeId && node.type === 'PIPELINE',
    );
    if (pipeline === undefined) throw WorkflowRunError.retryNotAllowed();
    const priorAttempts = snapshot.nodeAttempts.filter(
      (attempt) => attempt.nodeId === input.nodeId,
    );
    const previous = latestAttempt(priorAttempts, input.nodeId);
    if (previous === undefined || previous.state !== 'FAILED')
      throw WorkflowRunError.retryNotAllowed();
    const descendantNodes = descendantNodeIds(version.graph, input.nodeId);
    if (
      snapshot.nodeAttempts.some(
        (attempt) => descendantNodes.has(attempt.nodeId) && attempt.state !== 'SKIPPED',
      )
    ) {
      // A selected downstream job may have written data. Retrying an ancestor
      // would need a new route generation to distinguish those earlier effects.
      throw WorkflowRunError.retryNotAllowed();
    }
    for (const attempt of priorAttempts) {
      if (attempt.state === 'RUNNING' && attempt.executionId === undefined) {
        throw WorkflowRunError.retryNotAllowed();
      }
      if (attempt.executionId === undefined) continue;
      const status = await this.executor.read(attempt.executionId);
      if (status === 'PENDING' || status === 'RUNNING') throw WorkflowRunError.retryNotAllowed();
    }

    const now = this.clock.now();
    const retryAttempt = {
      id: this.ids.next(),
      organizationId: snapshot.run.organizationId,
      runId: snapshot.run.id,
      nodeId: input.nodeId,
      attemptNumber: previous.attemptNumber + 1,
      state: 'RUNNING' as const,
      createdAt: now,
      updatedAt: now,
    };
    const nodeAttempts = [...snapshot.nodeAttempts, retryAttempt];
    const descendants = descendantEdgeIds(version.graph, input.nodeId);
    const edgeStates = snapshot.edgeStates.map((edge) =>
      descendants.has(edge.edgeId) ? { ...edge, state: 'PENDING' as const, updatedAt: now } : edge,
    );
    const saved = await this.runs.saveTransition(snapshot.run, snapshot.run.revision, {
      status: 'QUEUED',
      updatedAt: now,
      nodeAttempts,
      edgeStates,
      retryAcknowledgements: [
        {
          id: this.ids.next(),
          organizationId: snapshot.run.organizationId,
          runId: snapshot.run.id,
          nodeAttemptId: retryAttempt.id,
          nodeId: retryAttempt.nodeId,
          attemptNumber: retryAttempt.attemptNumber,
          approvedBy: input.actor.identityId,
          acknowledgementSignal: true,
          purpose: 'DUPLICATE_APPEND_WRITE_RISK',
          acknowledgedAt: now,
        },
      ],
    });
    if (!saved) throw WorkflowRunError.revisionConflict();
  }
}

function latestAttempt<T extends { readonly nodeId: string; readonly attemptNumber: number }>(
  attempts: readonly T[],
  nodeId: string,
): T | undefined {
  return attempts
    .filter((attempt) => attempt.nodeId === nodeId)
    .reduce<T | undefined>(
      (latest, attempt) =>
        latest === undefined || attempt.attemptNumber > latest.attemptNumber ? attempt : latest,
      undefined,
    );
}

function descendantEdgeIds(graph: WorkflowGraph, nodeId: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const pending = [nodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.sourceNodeId !== current) continue;
      ids.add(edge.id);
      pending.push(edge.targetNodeId);
    }
  }
  return ids;
}

function descendantNodeIds(graph: WorkflowGraph, nodeId: string): ReadonlySet<string> {
  const descendants = new Set<string>();
  const pending = [nodeId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const edge of graph.edges) {
      if (edge.sourceNodeId !== current || descendants.has(edge.targetNodeId)) continue;
      descendants.add(edge.targetNodeId);
      pending.push(edge.targetNodeId);
    }
  }
  return descendants;
}

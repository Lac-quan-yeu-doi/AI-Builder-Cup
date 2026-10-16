import type { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type { ExecutionView } from '@application/execution-orchestration/read-models/execution.view';

/**
 * Projects an in-memory {@link Execution} onto its read model.
 *
 * Exists so a command does not have to re-read what it just wrote. The previous
 * shape was write, then load the same row back through the reader to build the
 * response. That cost an extra round trip per mutation and, more importantly, it
 * read the row through a projection that is not guaranteed to be current: the
 * response could reflect a state other than the one the command produced, and
 * against a read replica it routinely would.
 *
 * The aggregate already holds exactly the state that was just committed, so
 * projecting from it is both cheaper and more accurate. The read side keeps its
 * own mapper for genuine queries, where the database is the only source.
 */
export function toExecutionView(execution: Execution, logBucket: string): ExecutionView {
  return {
    id: execution.id.value,
    executionPrincipal:
      execution.authorizationIdentityId === undefined ? 'BACKGROUND' : 'REQUESTER',
    workloadKind: execution.workload.kind,
    versionNumber: execution.workload.versionNumber,
    scriptId: execution.scriptId,
    scriptVersionId: execution.scriptVersionId,
    pipelineId: execution.pipelineId,
    pipelineVersionId: execution.pipelineVersionId,
    connectionId: execution.connectionId,
    status: execution.status,
    sparkApplicationId: execution.sparkApplicationId?.value,
    resourceProfile: execution.resourceProfile.toRecord(),
    exitCode: execution.exitCode,
    errorSummary: execution.failure?.summary,
    outputConditionPlan: execution.outputConditionPlan,
    outputFacts: execution.outputFacts,
    outputFactsError: execution.outputFactsError,
    logBucket,
    logObjectKey: execution.logLocation.objectKey,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString(),
    finishedAt: execution.finishedAt?.toISOString(),
    cancelledAt: execution.cancelledAt?.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  };
}

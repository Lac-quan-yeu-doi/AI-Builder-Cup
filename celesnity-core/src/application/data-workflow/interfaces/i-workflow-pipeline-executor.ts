import type {
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { WorkflowNodeAttemptIdentity } from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import type {
  EnqueuedPreparedExecution,
  PreparedExecutionRequest,
} from '@application/execution-orchestration/prepared-execution-request.service';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';

export type WorkflowPipelineStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type WorkflowPreparedPipelineRequest = PreparedExecutionRequest;

export interface WorkflowPipelineReadResult {
  readonly status: WorkflowPipelineStatus;
  readonly outputFacts?: ExecutionOutputFacts;
  readonly outputFactsError?: string;
}

export interface IWorkflowPipelineExecutor {
  prepare(
    actor: WorkflowActor,
    pipeline: PipelineReference,
    outputConditionPlan?: ExecutionOutputConditionPlan,
  ): Promise<WorkflowPreparedPipelineRequest>;
  enqueuePrepared(
    attempt: WorkflowNodeAttemptIdentity,
    request: WorkflowPreparedPipelineRequest,
  ): Promise<EnqueuedPreparedExecution>;
  read(executionId: string): Promise<WorkflowPipelineStatus>;
  readResult(executionId: string): Promise<WorkflowPipelineReadResult>;
}

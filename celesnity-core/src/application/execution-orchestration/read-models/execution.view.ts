import type { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';

export interface ExecutionResourceProfileView {
  readonly driverMemory: string;
  readonly executorMemory: string;
  readonly executorCores: number;
  readonly maxCores: number;
}

/**
 * Read model for an execution. It intentionally omits any connection credential;
 * executions never persist or expose the decrypted runtime profile.
 */
export interface ExecutionView {
  readonly id: string;
  readonly executionPrincipal?: 'BACKGROUND' | 'REQUESTER';
  readonly workloadKind: 'SCRIPT' | 'PIPELINE';
  readonly versionNumber: number;
  readonly scriptId?: string;
  readonly scriptVersionId?: string;
  readonly pipelineId?: string;
  readonly pipelineVersionId?: string;
  readonly connectionId?: string;
  readonly status: ExecutionStatusValue;
  readonly sparkApplicationId?: string;
  readonly resourceProfile?: ExecutionResourceProfileView;
  readonly exitCode?: number;
  readonly errorSummary?: string;
  /** Internal execution read data; API response mappers deliberately omit it. */
  readonly outputConditionPlan?: ExecutionOutputConditionPlan;
  /** Bounded counts only; never contains customer row values. */
  readonly outputFacts?: ExecutionOutputFacts;
  readonly outputFactsError?: string;
  readonly logBucket?: string;
  readonly logObjectKey?: string;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly cancelledAt?: string;
  readonly updatedAt: string;
}

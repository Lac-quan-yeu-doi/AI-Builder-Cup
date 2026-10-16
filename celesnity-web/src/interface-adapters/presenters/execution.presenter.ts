import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionProgress,
  ExecutionResourceProfile,
  ExecutionStatus,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';

export interface ExecutionResourceProfileViewModel {
  readonly driverMemory: string;
  readonly executorMemory: string;
  readonly executorCores: number;
  readonly maxCores: number;
}

export interface ExecutionSummaryViewModel {
  readonly id: string;
  readonly workloadKind: 'SCRIPT' | 'PIPELINE';
  readonly executionPrincipal?: 'BACKGROUND' | 'REQUESTER';
  readonly versionNumber: number;
  readonly scriptId?: string;
  readonly scriptVersionId?: string;
  readonly pipelineId?: string;
  readonly pipelineVersionId?: string;
  readonly connectionId?: string;
  readonly status: ExecutionStatus;
  readonly sparkApplicationId?: string;
  readonly exitCode?: number;
  readonly errorSummary?: string;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

export interface ExecutionDetailViewModel extends ExecutionSummaryViewModel {
  readonly resourceProfile?: ExecutionResourceProfileViewModel;
  readonly cancelledAt?: string;
}

export interface ExecutionLogViewModel {
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly bucket: string;
  readonly objectKey: string;
  readonly content: string;
  readonly byteSize: number;
}

export interface ExecutionProgressViewModel {
  readonly id: string;
  readonly status: ExecutionStatus;
  readonly sparkApplicationId?: string;
  readonly exitCode?: number;
  readonly updatedAt: string;
}

export type RerunOutcomeViewModel =
  | { readonly kind: 'started'; readonly executionId: string; readonly status: ExecutionStatus }
  | { readonly kind: 'version-missing' }
  | { readonly kind: 'conflict'; readonly message: string };

export function presentExecutionSummary(execution: ExecutionSummary): ExecutionSummaryViewModel {
  return {
    id: execution.id,
    workloadKind: execution.workloadKind,
    executionPrincipal: execution.executionPrincipal,
    versionNumber: execution.versionNumber,
    ...(execution.scriptId !== undefined ? { scriptId: execution.scriptId } : {}),
    ...(execution.scriptVersionId !== undefined
      ? { scriptVersionId: execution.scriptVersionId }
      : {}),
    ...(execution.pipelineId !== undefined ? { pipelineId: execution.pipelineId } : {}),
    ...(execution.pipelineVersionId !== undefined
      ? { pipelineVersionId: execution.pipelineVersionId }
      : {}),
    connectionId: execution.connectionId,
    status: execution.status,
    queuedAt: execution.queuedAt,
    updatedAt: execution.updatedAt,
    ...(execution.sparkApplicationId !== undefined
      ? { sparkApplicationId: execution.sparkApplicationId }
      : {}),
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    ...(execution.errorSummary !== undefined ? { errorSummary: execution.errorSummary } : {}),
    ...(execution.startedAt !== undefined ? { startedAt: execution.startedAt } : {}),
    ...(execution.finishedAt !== undefined ? { finishedAt: execution.finishedAt } : {}),
  };
}

export function presentExecutionSummaries(
  executions: readonly ExecutionSummary[],
): readonly ExecutionSummaryViewModel[] {
  return executions.map(presentExecutionSummary);
}

export function presentExecutionDetail(execution: ExecutionDetail): ExecutionDetailViewModel {
  return {
    ...presentExecutionSummary(execution),
    ...(execution.resourceProfile !== undefined
      ? { resourceProfile: presentResourceProfile(execution.resourceProfile) }
      : {}),
    ...(execution.cancelledAt !== undefined ? { cancelledAt: execution.cancelledAt } : {}),
  };
}

export function presentExecutionLog(log: ExecutionLog): ExecutionLogViewModel {
  return {
    executionId: log.executionId,
    status: log.status,
    bucket: log.bucket,
    objectKey: log.objectKey,
    content: log.content,
    byteSize: log.byteSize,
  };
}

export function presentExecutionProgress(progress: ExecutionProgress): ExecutionProgressViewModel {
  return {
    id: progress.id,
    status: progress.status,
    updatedAt: progress.updatedAt,
    ...(progress.sparkApplicationId !== undefined
      ? { sparkApplicationId: progress.sparkApplicationId }
      : {}),
    ...(progress.exitCode !== undefined ? { exitCode: progress.exitCode } : {}),
  };
}

export function presentRerunOutcome(outcome: RerunOutcome): RerunOutcomeViewModel {
  switch (outcome.kind) {
    case 'started':
      return {
        kind: 'started',
        executionId: outcome.executionId,
        status: outcome.status,
      };
    case 'conflict':
      return { kind: 'conflict', message: outcome.message };
    case 'version-missing':
      return { kind: 'version-missing' };
  }
}

function presentResourceProfile(
  profile: ExecutionResourceProfile,
): ExecutionResourceProfileViewModel {
  return {
    driverMemory: profile.driverMemory,
    executorMemory: profile.executorMemory,
    executorCores: profile.executorCores,
    maxCores: profile.maxCores,
  };
}

import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
export type RerunExecutionUseCase = ReturnType<typeof createRerunExecutionUseCase>;

export interface ScriptExecutionVersion {
  readonly scriptId: string;
  readonly scriptVersionId: string;
}

export const createRerunExecutionUseCase =
  (repository: ExecutionRepository) => (execution: ScriptExecutionVersion) =>
    repository.rerun(execution.scriptId, execution.scriptVersionId);

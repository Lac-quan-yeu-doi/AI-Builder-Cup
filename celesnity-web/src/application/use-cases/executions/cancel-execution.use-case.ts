import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';

export type CancelExecutionUseCase = ReturnType<typeof createCancelExecutionUseCase>;

export const createCancelExecutionUseCase = (repository: ExecutionRepository) => (id: string) =>
  repository.cancel(id);

import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';

export type GetExecutionUseCase = ReturnType<typeof createGetExecutionUseCase>;

export const createGetExecutionUseCase = (repository: ExecutionRepository) => (id: string) =>
  repository.get(id);

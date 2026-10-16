import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';

export type GetExecutionLogsUseCase = ReturnType<typeof createGetExecutionLogsUseCase>;

export const createGetExecutionLogsUseCase = (repository: ExecutionRepository) => (id: string) =>
  repository.fetchLogs(id);

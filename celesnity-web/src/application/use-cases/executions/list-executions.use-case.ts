import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type { ExecutionSummary } from '@/src/entities/models/execution';

export type ListExecutionsUseCase = ReturnType<typeof createListExecutionsUseCase>;

export const createListExecutionsUseCase =
  (repository: ExecutionRepository) => async (): Promise<readonly ExecutionSummary[]> => {
    const executions = await repository.list();
    return [...executions].sort(byNewestFirst);
  };

export function byNewestFirst(left: ExecutionSummary, right: ExecutionSummary): number {
  const leftTime = Date.parse(left.queuedAt);
  const rightTime = Date.parse(right.queuedAt);
  const leftValid = !Number.isNaN(leftTime);
  const rightValid = !Number.isNaN(rightTime);

  if (leftValid && rightValid && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  return right.id.localeCompare(left.id);
}

import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';

export type ListQueryHistoryUseCase = ReturnType<typeof createListQueryHistoryUseCase>;

export const createListQueryHistoryUseCase = (repository: QueryRepository) => async () => {
  const history = await repository.listHistory();
  return [...history].sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));
};

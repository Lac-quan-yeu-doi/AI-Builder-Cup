import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';

export type CancelQueryUseCase = ReturnType<typeof createCancelQueryUseCase>;

export const createCancelQueryUseCase = (repository: QueryRepository) => (id: string) =>
  repository.cancel(id);

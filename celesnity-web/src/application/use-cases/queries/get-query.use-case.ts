import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';

export type GetQueryUseCase = ReturnType<typeof createGetQueryUseCase>;

export const createGetQueryUseCase = (repository: QueryRepository) => (id: string) =>
  repository.get(id);

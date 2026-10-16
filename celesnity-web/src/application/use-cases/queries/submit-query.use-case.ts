import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type { QueryEditorSession } from '@/src/entities/models/query';

export type SubmitQueryUseCase = ReturnType<typeof createSubmitQueryUseCase>;

export const createSubmitQueryUseCase =
  (repository: QueryRepository) => (session: QueryEditorSession) => {
    const catalog = session.context.catalog.trim();
    const namespace = session.context.namespace?.trim();
    return repository.submit({
      sql: session.sql,
      context: { catalog, ...(namespace ? { namespace } : {}) },
    });
  };

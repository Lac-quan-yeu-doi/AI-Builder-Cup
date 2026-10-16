import type { CitationRepository } from '@/src/application/repositories/citation.repository.interface';
import type { CitationRef, ResolvedCitation } from '@/src/entities/models/citation';

export type ResolveCitationsUseCase = (
  refs: readonly CitationRef[],
) => Promise<readonly ResolvedCitation[]>;

export const createResolveCitationsUseCase =
  (repository: CitationRepository): ResolveCitationsUseCase =>
  (refs: readonly CitationRef[]): Promise<readonly ResolvedCitation[]> => {
    return repository.resolve(refs);
  };

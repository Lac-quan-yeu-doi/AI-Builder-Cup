import type { CitationRef, ResolvedCitation } from '@/src/entities/models/citation';

export interface CitationRepository {
  resolve(refs: readonly CitationRef[]): Promise<readonly ResolvedCitation[]>;
}

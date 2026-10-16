import type { ResolvedCitation } from '@/src/entities/models/citation';

export interface ResolvedCitationViewModel {
  readonly type: 'chart' | 'document';
  readonly id: string;
  readonly found: boolean;
  readonly title: string | null;
  readonly page?: number;
}

export function presentResolvedCitation(citation: ResolvedCitation): ResolvedCitationViewModel {
  return Object.freeze({
    type: citation.type,
    id: citation.id,
    found: citation.found,
    title: citation.title,
    ...(citation.page === undefined ? {} : { page: citation.page }),
  });
}

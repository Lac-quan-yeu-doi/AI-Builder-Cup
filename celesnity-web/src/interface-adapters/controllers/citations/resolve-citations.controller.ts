import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ResolveCitationsUseCase } from '@/src/application/use-cases/citations/resolve-citations.use-case';
import type { CitationRef } from '@/src/entities/models/citation';
import {
  presentResolvedCitation,
  type ResolvedCitationViewModel,
} from '@/src/interface-adapters/presenters/citation.presenter';

import { resolveCitationsInputSchema } from './citation.schemas';

export type ResolveCitationsController = (
  refs: readonly CitationRef[],
) => Promise<readonly ResolvedCitationViewModel[]>;

export const createResolveCitationsController =
  (useCase: ResolveCitationsUseCase): ResolveCitationsController =>
  async (refs: readonly CitationRef[]): Promise<readonly ResolvedCitationViewModel[]> => {
    const parsed = resolveCitationsInputSchema.safeParse(refs);
    if (!parsed.success)
      throw new InputParseError('Invalid citation refs', { cause: parsed.error });
    const resolved = await useCase(parsed.data);
    return resolved.map(presentResolvedCitation);
  };

import type { ChartUseCases } from '@application/chart/chart.use-cases';

export type CitationType = 'chart' | 'document';

export interface CitationRef {
  readonly type: CitationType;
  readonly id: string;
  /** 1-indexed. Only meaningful for `type: 'document'`; ignored otherwise. */
  readonly page?: number;
}

export interface ResolvedCitation {
  readonly type: CitationType;
  readonly id: string;
  readonly found: boolean;
  /** The chart's title. `null` when not found or for a retired citation type. */
  readonly title: string | null;
  readonly page?: number;
}

/**
 * Resolves chart citations emitted by an agent. Document references are kept
 * as a tolerated legacy input so old conversations remain readable after the
 * document feature is removed.
 *
 * Deliberately tolerant of a stale or invalid reference: one bad citation
 * in a batch shouldn't prevent the rest from resolving, so a lookup
 * failure becomes `found: false` rather than rejecting the whole call.
 */
export class CitationUseCases {
  public constructor(private readonly chartUseCases: ChartUseCases) {}

  public async resolve(refs: readonly CitationRef[]): Promise<readonly ResolvedCitation[]> {
    return Promise.all(refs.map((ref) => this.resolveOne(ref)));
  }

  private async resolveOne(ref: CitationRef): Promise<ResolvedCitation> {
    if (ref.type === 'document') {
      return {
        type: ref.type,
        id: ref.id,
        found: false,
        title: null,
        ...(ref.page === undefined ? {} : { page: ref.page }),
      };
    }
    try {
      const chart = await this.chartUseCases.findById(ref.id);
      return { type: ref.type, id: ref.id, found: true, title: chart.title };
    } catch {
      return { type: ref.type, id: ref.id, found: false, title: null };
    }
  }
}

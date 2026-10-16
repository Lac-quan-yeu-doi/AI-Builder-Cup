import type { ChartUseCases } from '@application/chart/chart.use-cases';
import type { DocumentUseCases } from '@application/document/document.use-cases';

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
  /** The chart's title, or the document's filename. `null` when not found. */
  readonly title: string | null;
  readonly page?: number;
}

/**
 * Resolves the `<citation>` tags an agent emits in a chat response (see
 * `chat-assistant.yaml`'s "Citing charts and documents" instructions) back
 * into something displayable — mirroring AIP Chatbot Studio's citation
 * bubbles, which resolve a cited object/document reference to a title a
 * user can click through.
 *
 * Deliberately tolerant of a stale or invalid reference: one bad citation
 * in a batch shouldn't prevent the rest from resolving, so a lookup
 * failure becomes `found: false` rather than rejecting the whole call.
 */
export class CitationUseCases {
  public constructor(
    private readonly chartUseCases: ChartUseCases,
    private readonly documentUseCases: DocumentUseCases,
  ) {}

  public async resolve(refs: readonly CitationRef[]): Promise<readonly ResolvedCitation[]> {
    return Promise.all(refs.map((ref) => this.resolveOne(ref)));
  }

  private async resolveOne(ref: CitationRef): Promise<ResolvedCitation> {
    try {
      if (ref.type === 'chart') {
        const chart = await this.chartUseCases.findById(ref.id);
        return { type: ref.type, id: ref.id, found: true, title: chart.title };
      }
      const document = await this.documentUseCases.findById(ref.id);
      return {
        type: ref.type,
        id: ref.id,
        found: true,
        title: document.filename,
        ...(ref.page === undefined ? {} : { page: ref.page }),
      };
    } catch {
      return { type: ref.type, id: ref.id, found: false, title: null };
    }
  }
}

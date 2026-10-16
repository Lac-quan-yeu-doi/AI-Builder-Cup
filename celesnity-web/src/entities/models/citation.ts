export type CitationType = 'chart' | 'document';

export interface CitationRef {
  readonly type: CitationType;
  readonly id: string;
  /** 1-indexed. Only meaningful for `type: 'document'`. */
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

const CITATION_TAG_PATTERN =
  /<citation><type>(chart|document)<\/type><id>([^<]+)<\/id>(?:<page>(\d+)<\/page>)?<\/citation>/g;

/** Stable identity for a citation, independent of resolution — used to key resolved-citation maps. */
export function citationKey(ref: Pick<CitationRef, 'type' | 'id' | 'page'>): string {
  return `${ref.type}:${ref.id}:${ref.page ?? ''}`;
}

/**
 * Scans an assistant reply for `<citation>` tags emitted per
 * `chat-assistant.yaml`'s "Citing charts and documents" instructions,
 * de-duplicated by identity — a message can cite the same chart or
 * document more than once, but the batch resolve call only needs it once.
 */
export function extractCitationRefs(content: string): readonly CitationRef[] {
  const seen = new Set<string>();
  const refs: CitationRef[] = [];
  for (const match of content.matchAll(CITATION_TAG_PATTERN)) {
    if (match[1] === undefined || match[2] === undefined) continue;
    const ref = toCitationRef(match[1], match[2], match[3]);
    const key = citationKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

/**
 * Converts each `<citation>` tag into a standard markdown link with a
 * custom URI scheme (`citation://chart/<id>` or
 * `citation://document/<id>?page=<n>`) — a token `remark` already parses
 * natively and safely, unlike a hand-rolled split-and-splice on the raw
 * HTML-like tags. `ChatMarkdown`'s `a` override special-cases this scheme
 * and renders a `CitationBubble` instead of a real anchor.
 */
export function rewriteCitationTags(content: string): string {
  return content.replace(
    CITATION_TAG_PATTERN,
    (_match, type: string, id: string, page?: string) => {
      const ref = toCitationRef(type, id, page);
      const query = ref.page === undefined ? '' : `?page=${ref.page}`;
      return `[cite](citation://${ref.type}/${encodeURIComponent(ref.id)}${query})`;
    },
  );
}

/** The inverse of the URI half of `rewriteCitationTags` — used by the `a` override to recover the ref from `href`. */
export function parseCitationHref(href: string): CitationRef | null {
  if (!href.startsWith('citation://')) return null;
  try {
    const url = new URL(href);
    const type = url.hostname;
    if (type !== 'chart' && type !== 'document') return null;
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!id) return null;
    const pageParam = url.searchParams.get('page');
    const page = pageParam ? Number(pageParam) : undefined;
    return page === undefined ? { type, id } : { type, id, page };
  } catch {
    return null;
  }
}

function toCitationRef(type: string, id: string, rawPage: string | undefined): CitationRef {
  const page = rawPage ? Number(rawPage) : undefined;
  const citationType = type as CitationType;
  return page === undefined ? { type: citationType, id } : { type: citationType, id, page };
}

/**
 * Where in a reply a tool call happened.
 *
 * A chart used to render at the top of the answer, above every sentence,
 * because a block and the prose were two lists with nothing tying them
 * together. The agent announces a call in the sentence before it ("I will
 * chart revenue by month"), so the tail of the reply at that moment is
 * remembered with the call, and the result is placed just after that sentence
 * — the same spot in the reply the reader saw the announcement.
 *
 * A tail rather than a bare offset: the rendered text is not the raw stream
 * (system reminders are removed, suggestion tags stripped, citations
 * rewritten), so an offset alone would drift, while a run of prose survives
 * every one of those rewrites. The offset still travels along to pick the
 * right occurrence when the same sentence appears twice.
 */
export const TEXT_ANCHOR_LENGTH = 48;

export function textAnchorOf(text: string): string {
  return text.slice(-TEXT_ANCHOR_LENGTH);
}

/**
 * The position in `text` just after `anchor`: 0 for an empty anchor (the call
 * came before any prose), -1 when the anchor is not in the text (yet). With
 * several occurrences, the one nearest `near` wins.
 */
export function textAnchorPosition(text: string, anchor: string, near?: number): number {
  if (anchor === '') return 0;
  let best = -1;
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(anchor, from);
    if (at === -1) break;
    const end = at + anchor.length;
    if (best === -1 || (near !== undefined && Math.abs(end - near) < Math.abs(best - near))) {
      best = end;
    }
    if (near === undefined) break;
    from = at + 1;
  }
  return best;
}

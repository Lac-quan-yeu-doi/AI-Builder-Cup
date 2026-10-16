/**
 * How much of a streamed message to show next.
 *
 * Text arrives in bursts — one network read hands the parser a dozen tokens,
 * and rendered whole they land as a block. Revealing a word or two per tick
 * instead lets each word fade in on its own (see `ChatMarkdown`'s
 * `animateFrom`), the way a token-by-token stream looks. The pace follows the
 * backlog, so the shown text never trails what has arrived by more than about
 * `REVEAL_FRAMES` ticks. A word still being written shows as far as it has
 * come — holding it back would leave the last word of a sentence hidden for
 * as long as the agent is busy with tools before it writes the next one.
 *
 * Inline markup is the exception: `**bold`, `` `code `` or `[a link` shown
 * before its closer renders as the literal characters, then snaps into its
 * styled form a moment later. While the stream is open, a reveal that would
 * end inside such a span either runs on to the closer, when it has arrived,
 * or waits just before the opener until it does (or until the opener is far
 * enough behind to count as a stray character).
 */

/** Ticks over which a backlog is drained: about 400 ms at `REVEAL_TICK_MS`. */
export const REVEAL_FRAMES = 12;

/**
 * Milliseconds between reveals: 30 a second. Every reveal re-renders the
 * whole message, and for a long one that costs more than a 60 fps frame
 * leaves; at 30 fps two words a tick still read as flowing.
 */
export const REVEAL_TICK_MS = 32;

/**
 * How long a word fades in for (the CSS `token-in` animation). A word counts
 * as settled — and renders plain — `SETTLE_MS` after it was revealed: later
 * than the fade, so a fade that ran late on a busy frame still finishes
 * before its animation is taken away. Keeping the animation on settled words
 * is what let a long reply build up hundreds of live animations, enough to
 * stall them all mid-fade.
 */
export const TOKEN_IN_MS = 450;
export const SETTLE_MS = 800;

/** An opener this far behind the end of the text is a stray character. */
const OPEN_MARKUP_PATIENCE = 80;

/**
 * How long after the last chunk the text still counts as arriving. While it
 * is, the half-written last word is held back: shown as it grows it reflows
 * the line on every token. Once the chunks pause — the agent is thinking or
 * running tools — it is let out, so the last word of a sentence is never
 * hidden for the length of a tool call.
 */
export const HOLD_PARTIAL_WORD_MS = 300;

export function revealMore(
  content: string,
  shown: number,
  streaming: boolean,
  arriving = false,
): number {
  const limit = streaming && arriving ? completeWordsEnd(content) : content.length;
  const from = Math.min(shown, content.length);
  if (from >= limit) return from;
  const backlog = countWords(content.slice(from, limit));
  const words = Math.max(1, Math.ceil(backlog / REVEAL_FRAMES));
  let at = from;
  for (let step = 0; step < words && at < limit; step += 1)
    at = Math.min(limit, wordEnd(content, at));
  return streaming ? Math.min(limit, keepMarkupWhole(content, from, at)) : at;
}

/** The index just past the last whitespace: everything before it is a whole word. */
function completeWordsEnd(content: string): number {
  const match = /\s\S*$/.exec(content);
  return match === null ? 0 : match.index + 1;
}

function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

/** Past the next word from `at`, and past the whitespace that follows it. */
function wordEnd(content: string, at: number): number {
  let index = at;
  while (index < content.length && /\s/.test(content.charAt(index))) index += 1;
  while (index < content.length && !/\s/.test(content.charAt(index))) index += 1;
  while (index < content.length && /\s/.test(content.charAt(index))) index += 1;
  return index;
}

interface Pair {
  readonly open: string;
  readonly close: string;
  /** How far behind the text the opener may fall before it counts as a stray. */
  readonly patience?: number;
}

/**
 * The agent's own tags are held whole too: a half-arrived `<suggestion>` or
 * `<citation>` renders as its inner text until its closer lands and it is
 * swapped for a chip or a badge. Their contents run to a sentence, so they
 * are given more room than a stray asterisk.
 */
const PAIRS: readonly Pair[] = [
  { open: '**', close: '**' },
  { open: '`', close: '`' },
  { open: '[', close: ']' },
  { open: '<suggestion>', close: '</suggestion>', patience: 240 },
  { open: '<citation>', close: '</citation>', patience: 240 },
];

/**
 * `at` moved so that no `**`, backtick or bracket span is cut in two: on past
 * the closer when the content already has it, back before the opener when it
 * does not, unless the opener is old enough to be a stray.
 */
function keepMarkupWhole(content: string, from: number, at: number): number {
  let end = at;
  for (const pair of PAIRS) {
    const opener = unclosedOpener(content.slice(0, end), pair);
    if (opener === -1) continue;
    const close = content.indexOf(pair.close, end);
    if (close !== -1) {
      let past = close + pair.close.length;
      // A link's closer is followed by its target: `[text](url)`.
      if (pair.open === '[' && content.charAt(past) === '(') {
        const target = content.indexOf(')', past);
        if (target === -1)
          return content.length - opener > OPEN_MARKUP_PATIENCE ? end : Math.max(from, opener);
        past = target + 1;
      }
      // Then the whitespace after it, so the next tick starts on a word.
      while (past < content.length && /\s/.test(content.charAt(past))) past += 1;
      end = Math.max(end, past);
    } else if (content.length - opener <= OPEN_MARKUP_PATIENCE) {
      return Math.max(from, opener);
    }
  }
  return end;
}

/** Index of the last opener of `pair` in `shown` that has no closer after it, or -1. */
function unclosedOpener(
  shown: string,
  pair: { readonly open: string; readonly close: string },
): number {
  if (pair.open === pair.close) {
    const count = shown.split(pair.open).length - 1;
    return count % 2 === 1 ? shown.lastIndexOf(pair.open) : -1;
  }
  const opener = shown.lastIndexOf(pair.open);
  return opener !== -1 && !shown.includes(pair.close, opener) ? opener : -1;
}

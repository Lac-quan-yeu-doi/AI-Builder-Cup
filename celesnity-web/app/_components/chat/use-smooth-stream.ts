'use client';

import { useEffect, useRef, useState } from 'react';

import { HOLD_PARTIAL_WORD_MS, REVEAL_TICK_MS, revealMore, SETTLE_MS } from './stream-reveal';

export interface SmoothStream {
  /** The part of the message to render right now. */
  readonly text: string;
  /**
   * Words before this offset of `text` were revealed at least `SETTLE_MS`
   * ago and have finished fading in; render them plain.
   */
  readonly settled: number;
}

interface Reveal {
  readonly shown: number;
  readonly settled: number;
}

/** More text than this at mount is a message already on screen, not a fresh stream. */
const MOUNT_REVEAL_LIMIT = 240;

/**
 * A streaming message let out a word or two per tick (see `revealMore`), so a
 * burst of tokens unfolds instead of landing as a block, together with the
 * offset before which the words have settled. A message that is not streaming
 * shows whole and settled from its first render; one that stops streaming with
 * words still queued lets them out over the next ticks rather than dumping
 * them.
 */
export function useSmoothStream(content: string, streaming: boolean): SmoothStream {
  // A message that mounts with more than a chunk's worth of text already was
  // not just started — the transcript was re-keyed or reopened mid-stream —
  // and shows what it has at once rather than playing it all back.
  const [reveal, setReveal] = useState<Reveal>(() =>
    streaming && content.length < MOUNT_REVEAL_LIMIT
      ? { shown: 0, settled: 0 }
      : { shown: content.length, settled: content.length },
  );
  // When each reveal happened, oldest first, so `settled` can trail `shown`
  // by a fade's length. Only the tick callback touches it.
  const history = useRef<{ at: number; shown: number }[]>([]);
  // When the content last grew: while it keeps growing the last, half-written
  // word is held back (see `revealMore`).
  const grewAt = useRef(0);
  useEffect(() => {
    grewAt.current = performance.now();
  }, [content]);

  useEffect(() => {
    const { shown, settled } = reveal;
    if (shown >= content.length && settled >= shown) return undefined;
    // A held-back word needs a later tick to be let out once the chunks
    // pause, so the loop keeps ticking while anything is unshown.
    let lastTick = -Infinity;
    let frame = requestAnimationFrame(function tick(now) {
      if (now - lastTick < REVEAL_TICK_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      lastTick = now;
      const arriving = performance.now() - grewAt.current < HOLD_PARTIAL_WORD_MS;
      const nextShown = revealMore(content, shown, streaming, arriving);
      const past = history.current;
      if (nextShown > shown) past.push({ at: now, shown: nextShown });
      // Drop entries older than the settle window, keeping the newest of
      // them: it says how far the words had got by a window ago.
      while (past.length > 1 && now - (past[1]?.at ?? now) >= SETTLE_MS) past.shift();
      const oldest = past[0];
      const nextSettled =
        oldest !== undefined && now - oldest.at >= SETTLE_MS
          ? Math.max(settled, Math.min(oldest.shown, nextShown))
          : settled;
      if (nextShown !== shown || nextSettled !== settled)
        setReveal({ shown: nextShown, settled: nextSettled });
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [content, reveal, streaming]);

  const text = content.slice(0, Math.min(reveal.shown, content.length));
  return { text, settled: Math.min(reveal.settled, text.length) };
}

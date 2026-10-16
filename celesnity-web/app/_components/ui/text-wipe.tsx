'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/app/_components/ui/utils';

/** Milliseconds the cursor spends on each character. */
export const WIPE_MS_PER_CHAR = 20;

/** The block cursor: a full-block glyph, so it needs no sizing of its own. */
export const WIPE_CURSOR = '█';

interface TextWipeProps {
  readonly text: string;
  readonly className?: string;
}

/**
 * A status line whose changes are wiped in rather than swapped: a block cursor
 * sweeps left to right, every character it passes turns from the old text
 * into the new, and once it reaches the end it is gone — at rest the line is
 * plain text. Under reduced motion the text simply changes.
 */
export function TextWipe({ text, className }: TextWipeProps) {
  // `shown` is what the cursor has not yet reached; `target` is what it is
  // writing. A new `text` retargets a wipe in progress from where it is.
  const [shown, setShown] = useState(text);
  const [target, setTarget] = useState(text);
  const [cursor, setCursor] = useState<number | null>(null);
  if (text !== target) {
    setTarget(text);
    if (prefersReducedMotion()) setShown(text);
    else if (cursor === null) setCursor(0);
  }

  useEffect(() => {
    if (cursor === null) return undefined;
    const timer = setTimeout(() => {
      const next = cursor + 1;
      if (next > Math.max(shown.length, target.length)) {
        setShown(target);
        setCursor(null);
      } else {
        setCursor(next);
      }
    }, WIPE_MS_PER_CHAR);
    return () => clearTimeout(timer);
  }, [cursor, shown.length, target]);

  if (cursor === null) return <span className={className}>{shown}</span>;
  return (
    <span className={cn('whitespace-pre', className)} aria-label={target}>
      <span aria-hidden="true">{target.slice(0, cursor)}</span>
      <span aria-hidden="true">{WIPE_CURSOR}</span>
      <span aria-hidden="true">{shown.slice(cursor + 1)}</span>
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

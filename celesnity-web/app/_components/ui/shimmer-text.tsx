import type { ComponentProps } from 'react';

import { cn } from '@/app/_components/ui/utils';

/**
 * Text with a light gliding across it, for a status that is in progress
 * ("Searching…"): the glyphs are cut out of a gradient a little more than
 * twice their width, and the gradient slides. The stops default to the muted
 * text colour with a lighter band; pass `from-*`/`via-*`/`to-*` to shine a
 * different colour. Under reduced motion the text is plain, in whatever
 * `text-*` colour the caller set.
 */
export function ShimmerText({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'motion-safe:animate-text-sheen motion-safe:bg-linear-to-r motion-safe:from-muted-foreground motion-safe:from-40% motion-safe:via-muted-foreground/35 motion-safe:via-50% motion-safe:to-muted-foreground motion-safe:to-60% motion-safe:bg-size-[220%_100%] motion-safe:bg-clip-text motion-safe:text-transparent',
        className,
      )}
      {...props}
    />
  );
}

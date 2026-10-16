'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/app/_components/ui/utils';

interface GrowInProps {
  /**
   * Whether to grow at all. A row that appears above text the reader is
   * already reading — a tool summary, a chart, a status — eases that text
   * down instead of shoving it. A row that is simply part of a page being
   * laid out should not: it appears at once.
   */
  readonly active: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * Grows from nothing to its content height over a moment when it mounts, then
 * gets out of the way: the clip that hides the content while it grows is
 * lifted once the growth has ended, so a chart's tooltip or a popover can
 * spill past the row later. Under reduced motion it appears at once.
 */
export function GrowIn({ active, className, children }: GrowInProps) {
  const [phase, setPhase] = useState<'closed' | 'growing' | 'grown'>(active ? 'closed' : 'grown');

  useEffect(() => {
    if (phase !== 'closed') return undefined;
    const frame = requestAnimationFrame(() => setPhase('growing'));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return (
    <div
      className={cn(
        'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
        phase === 'closed' ? 'motion-safe:grid-rows-[0fr]' : 'grid-rows-[1fr]',
        className,
      )}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setPhase('grown');
      }}
    >
      <div className={cn('min-h-0 min-w-0', phase !== 'grown' && 'motion-safe:overflow-hidden')}>
        {children}
      </div>
    </div>
  );
}

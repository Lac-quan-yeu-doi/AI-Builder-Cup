'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ThinkingOrb as Orb, type OrbSize, type OrbState } from 'thinking-orbs';

import { cn } from '@/app/_components/ui/utils';

export type ThinkingOrbState = OrbState;
export type ThinkingOrbSize = OrbSize;

interface ThinkingOrbProps {
  /** What the agent is doing; picks the animation. @default 'working' */
  readonly state?: ThinkingOrbState;
  /** 20 sits inline with text, 32 beside a message, 64 stands alone. @default 20 */
  readonly size?: ThinkingOrbSize;
  /** Read to assistive technology: the orb is an image of the state. */
  readonly label: string;
  /**
   * A text colour utility the dots take their ink from, e.g.
   * `text-status-info-dark`. Only tokens that resolve to a plain `#rrggbb` or
   * `rgb()` value work: the canvas cannot read CSS variables, so the colour is
   * read back from the element once it is on screen.
   */
  readonly tint?: string;
  readonly className?: string;
}

/**
 * The dotted "thinking" orb for a wait that has a subject — the agent working,
 * searching, listening — where a spinner only says "busy". Keep `Spinner` for
 * data that is merely loading.
 *
 * Celesnity addition: the theme is pinned to light. The app has no dark mode
 * yet (`color-scheme: light`, no `dark` class on an ancestor), and the
 * library's `auto` would then follow the OS and draw light dots on this light
 * background. Lift the pin together with the first dark theme.
 */
export function ThinkingOrb({
  state = 'working',
  size = 20,
  label,
  tint,
  className,
}: ThinkingOrbProps) {
  const host = useRef<HTMLSpanElement>(null);
  const [ink, setInk] = useState<string>();

  useLayoutEffect(() => {
    if (tint === undefined || host.current === null) return;
    const color = getComputedStyle(host.current).color;
    setInk(/^(#|rgb\()/u.test(color) ? color : undefined);
  }, [tint]);

  return (
    <span ref={host} className={cn('inline-flex shrink-0', tint)}>
      <Orb
        aria-label={label}
        className={cn('shrink-0', className)}
        size={size}
        state={state}
        theme="light"
        {...(ink === undefined ? {} : { color: ink })}
      />
    </span>
  );
}

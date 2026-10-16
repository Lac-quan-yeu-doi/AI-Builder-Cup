import type { ReactNode } from 'react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './empty';
import { cn } from './utils';

export type EmptyStateTone = 'neutral' | 'danger';

interface EmptyStateProps {
  /** Call to action, e.g. a `Button`. */
  readonly action?: ReactNode;
  readonly description?: ReactNode;
  /** Single glyph shown above the title; decorative. */
  readonly mark?: ReactNode;
  /** Minimum height of the block, matching the panel it fills. */
  readonly minHeight?: number;
  readonly title: ReactNode;
  readonly tone?: EmptyStateTone;
}

/**
 * The "nothing here yet" panel: mark, heading, explanation, one way forward.
 *
 * Built on shadcn/ui's `Empty`, with one addition the primitive leaves open: a
 * real `h3`, so the state is reachable by heading navigation rather than being
 * loose centred text.
 */
export function EmptyState({
  action,
  description,
  mark,
  minHeight = 320,
  title,
  tone = 'neutral',
}: EmptyStateProps) {
  return (
    <Empty className="border-none" style={{ minHeight }}>
      <EmptyHeader>
        {mark ? (
          <EmptyMedia
            variant="icon"
            className={cn(
              tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
            )}
            aria-hidden="true"
          >
            {mark}
          </EmptyMedia>
        ) : null}
        {/* `Empty` renders its title as a plain div; the ARIA heading role
            restores the level so the state is reachable by heading navigation. */}
        <EmptyTitle role="heading" aria-level={3}>
          {title}
        </EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

interface EmptyBlockProps {
  /** Call to action, centred under the copy. */
  readonly action?: ReactNode;
  readonly description?: ReactNode;
  readonly role?: 'alert' | 'status';
  readonly title: ReactNode;
}

/**
 * The compact sibling of `EmptyState`: a dashed block that sits inside a panel
 * rather than filling one.
 */
export function EmptyBlock({ action, description, role, title }: EmptyBlockProps) {
  return (
    <Empty className="gap-3 border bg-accent px-6 py-8 md:p-8" role={role}>
      <EmptyHeader className="gap-1.5">
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

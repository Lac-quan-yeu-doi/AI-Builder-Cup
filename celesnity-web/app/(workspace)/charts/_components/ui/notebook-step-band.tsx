import type { ReactNode } from 'react';
import { DatabaseIcon, FilterIcon, SigmaIcon, type LucideIcon } from 'lucide-react';

import { cn } from '@/app/_components/ui/utils';

export type NotebookTone = 'DATA' | 'FILTER' | 'SUMMARIZE';

/**
 * A step's identity used to be a hue — blue, purple, green, borrowed wholesale
 * from another product's brand. It is an icon now. Colour was redundant with
 * proximity: a clause chip already sits inside its own labelled band, so the
 * band repeating that fact in a third palette bought nothing and cost the skin.
 */
const toneIcon = {
  DATA: DatabaseIcon,
  FILTER: FilterIcon,
  SUMMARIZE: SigmaIcon,
} satisfies Record<NotebookTone, LucideIcon>;

/** The one band surface. Kept as a named export because the join and summarize
 * steps build their own multi-part bands and have to match it exactly. */
const bandSurface = 'rounded-md bg-muted p-4';

export interface NotebookStepBandProps {
  readonly tone: NotebookTone;
  readonly label: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly surface?: 'TINTED' | 'CLEAR';
}

export function NotebookStepBand({
  tone,
  label,
  action,
  children,
  className,
  surface = 'TINTED',
}: NotebookStepBandProps) {
  const Icon = toneIcon[tone];
  return (
    <section
      className={cn('space-y-2', className)}
      data-tone={tone}
      aria-label={label}
      role="region"
    >
      <h2 className="flex items-center gap-1.5 text-label text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
      </h2>
      <div className="flex min-h-18 min-w-0 items-center gap-3">
        <div
          className={cn('min-w-0 flex-1', surface === 'TINTED' && cn('min-h-18', bandSurface))}
          data-surface={surface}
          data-testid="notebook-step-content"
        >
          {children}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}

export { bandSurface };

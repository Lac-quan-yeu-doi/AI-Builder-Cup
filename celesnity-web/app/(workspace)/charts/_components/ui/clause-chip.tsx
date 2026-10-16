import type { ReactNode } from 'react';
import { PencilIcon, XIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';

import type { NotebookTone } from './notebook-step-band';

/**
 * A chip is a thing the user chose, so it wears the skin's selection surface —
 * the same one the sidebar rail uses for the row you are on. It no longer
 * varies by step: the chip sits inside its step's labelled band already, and
 * three saturated fills competing down one column read as decoration.
 */
const chipSurface =
  'bg-sidebar-selected text-foreground ring-1 ring-ring/15 ring-inset dark:ring-ring/25';

export interface ClauseChipProps {
  readonly tone: NotebookTone;
  readonly children: ReactNode;
  readonly ariaLabel: string;
  readonly onEdit?: () => void;
  readonly editAriaLabel?: string;
  readonly editIcon?: ReactNode;
  readonly onRemove?: () => void;
}

export function ClauseChip({
  tone,
  children,
  ariaLabel,
  onEdit,
  editAriaLabel,
  editIcon,
  onRemove,
}: ClauseChipProps) {
  return (
    <div
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm p-2.5 text-body-sm font-medium',
        chipSurface,
      )}
      data-tone={tone}
      role="group"
      aria-label={ariaLabel}
    >
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-tone={tone}
          className="h-auto min-h-0 min-w-0 flex-1 justify-start gap-1.5 rounded-xs p-0 text-current hover:bg-foreground/8 hover:text-current"
          aria-label={editAriaLabel ?? `Edit ${ariaLabel}`}
          onClick={onEdit}
        >
          {editIcon ?? <PencilIcon aria-hidden="true" className="size-3 shrink-0" />}
          <span className="min-w-0 truncate">{children}</span>
        </Button>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 rounded-xs p-0 text-current hover:bg-foreground/8 hover:text-current"
          aria-label={`Remove ${ariaLabel}`}
          onClick={onRemove}
        >
          <XIcon aria-hidden="true" className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

export { chipSurface };

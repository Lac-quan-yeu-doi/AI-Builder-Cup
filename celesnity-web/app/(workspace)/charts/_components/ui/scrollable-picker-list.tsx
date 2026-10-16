import type { ReactNode } from 'react';

import { cn } from '@/app/_components/ui/utils';

export interface ScrollablePickerListProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

/** A bounded picker body whose footer remains visible while items scroll. */
export function ScrollablePickerList({
  ariaLabel,
  children,
  footer,
  className,
}: ScrollablePickerListProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div
        className="max-h-52 overflow-y-auto overscroll-contain p-1"
        role="list"
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-border p-1">{footer}</div> : null}
    </div>
  );
}

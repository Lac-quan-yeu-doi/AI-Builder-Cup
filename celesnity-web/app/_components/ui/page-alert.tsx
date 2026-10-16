import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';
import { cn } from './utils';

export type PageAlertTone = 'error' | 'warning' | 'success' | 'info';

export type PageAlertProps = Omit<ComponentProps<typeof Alert>, 'variant' | 'title'> & {
  readonly children: ReactNode;
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
  readonly title?: ReactNode;
  readonly tone?: PageAlertTone;
};

/*
 * The workspace states read as tinted banners rather than shadcn's card-toned
 * default, and only the failure case is urgent enough to interrupt a screen
 * reader — hence `alert` for errors and the polite `status` for the rest.
 */
const toneClasses: Readonly<Record<PageAlertTone, string>> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  // Something went wrong but the screen still has something to show — a failed
  // scan behind a usable older snapshot, not a dead end.
  warning: 'border-status-warning/30 bg-status-warning-light text-status-warning-dark',
  success: 'border-status-success/30 bg-status-success-light text-status-success-dark',
  info: 'border-status-info/30 bg-status-info-light text-status-info-dark',
};

/** Page-level banner with an optional dismiss control. */
export function PageAlert({
  children,
  className,
  dismissLabel = 'Dismiss',
  onDismiss,
  title,
  tone = 'error',
  ...rest
}: PageAlertProps) {
  return (
    <Alert
      className={cn(toneClasses[tone], onDismiss && 'pr-12', className)}
      role={tone === 'error' ? 'alert' : 'status'}
      {...rest}
    >
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription className="text-current">{children}</AlertDescription>
      {onDismiss ? (
        <Button
          className="absolute top-2 right-2 text-current hover:bg-black/5"
          onClick={onDismiss}
          size="icon-sm"
          variant="ghost"
          aria-label={dismissLabel}
        >
          <XIcon />
        </Button>
      ) : null}
    </Alert>
  );
}

/** Inline validation or failure text inside a form or panel. */
export function InlineError({
  children,
  className,
  ...rest
}: Omit<ComponentProps<typeof Alert>, 'variant'>) {
  return (
    <Alert
      className={cn('rounded-md border-destructive/30 bg-destructive/10 px-3 py-2', className)}
      role="alert"
      {...rest}
    >
      <AlertDescription className="text-destructive">{children}</AlertDescription>
    </Alert>
  );
}

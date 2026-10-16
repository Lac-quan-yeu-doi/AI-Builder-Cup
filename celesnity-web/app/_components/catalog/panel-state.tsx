'use client';

import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';

const blockStateClass =
  'flex flex-col items-center justify-center gap-[10px] px-6 py-[34px] text-center';
const blockCopyClass = 'm-0 max-w-[380px] text-caption leading-[1.55]';
const blockMarkClass = 'grid size-[38px] place-items-center rounded-lg text-body-lg font-semibold';
const retryButtonClass =
  'cursor-pointer border-0 bg-transparent p-0 text-caption font-semibold text-primary underline hover:text-primary/80 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-border';

export function BlockLoading({ label }: { readonly label: string }) {
  return (
    <div className={blockStateClass} role="status">
      <span
        className="size-[28px] animate-[spin_800ms_linear_infinite] rounded-full border-[3px] border-border border-t-primary"
        aria-hidden="true"
      />
      <p className={cn(blockCopyClass, 'text-muted-foreground')}>{label}</p>
    </div>
  );
}

interface BlockErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function BlockError({ message, onRetry }: BlockErrorProps) {
  const { t } = useTranslation();

  return (
    <div className={blockStateClass} role="alert">
      <span className={cn(blockMarkClass, 'bg-destructive/15 text-destructive')} aria-hidden="true">
        !
      </span>
      <p className={cn(blockCopyClass, 'text-destructive')}>{message}</p>
      <button className={retryButtonClass} type="button" onClick={onRetry}>
        {t('database.table.retry')}
      </button>
    </div>
  );
}

interface BlockEmptyProps {
  readonly title: string;
  readonly description: string;
}

export function BlockEmpty({ title, description }: BlockEmptyProps) {
  return (
    <div className={blockStateClass}>
      <span className={cn(blockMarkClass, 'bg-accent text-primary')} aria-hidden="true">
        —
      </span>
      <p className={cn(blockCopyClass, 'text-muted-foreground')}>
        <strong>{title}</strong>
        <br />
        {description}
      </p>
    </div>
  );
}

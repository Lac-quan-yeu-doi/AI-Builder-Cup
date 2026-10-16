import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from './utils';

interface PageBarProps {
  /** Controls on the trailing edge — usually one primary action. */
  readonly actions?: ReactNode;
  /**
   * The screen this one opened from, shown as a labelled back link above the
   * title. A detail screen reached by drilling in needs a visible way out;
   * carrying the parent's name in a `Badge` beside the metadata reads as one
   * more chip, not as the exit.
   */
  readonly backTo?: { readonly href: string; readonly label: string };
  /** Status chips or counts rendered beside the title. */
  readonly meta?: ReactNode;
  /** One short line under the title. Omit it when the title is self-evident. */
  readonly description?: ReactNode;
  readonly title: ReactNode;
}

/**
 * The heading strip every workspace screen opens with.
 *
 * It replaces a marketing hero — a `clamp(2.4rem, 5vw, 4.45rem)` headline with
 * an eyebrow and a paragraph — that cost roughly 250px above the fold on every
 * screen. On a 900px viewport that is a quarter of the window spent restating
 * the name of the page the user just navigated to, which pushed the actual
 * table or tree below the fold.
 *
 * The title sits at `text-xl`: large enough to anchor the page, small enough
 * that the data starts immediately under it.
 */
export function PageBar({ actions, backTo, description, meta, title }: PageBarProps) {
  return (
    <header className="grid gap-2 pb-5">
      {backTo ? (
        <Link
          className="-ml-1 flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-caption text-muted-foreground hover:text-foreground"
          href={backTo.href}
        >
          <ArrowLeftIcon aria-hidden="true" size={16} />
          {backTo.label}
        </Link>
      ) : null}

      <div
        className={cn('flex flex-col items-start gap-3', 'md:flex-row md:items-center md:gap-4')}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="m-0 truncate text-xl font-[650] tracking-[-0.02em]">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="m-0 max-w-[760px] text-body-sm leading-[1.55] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:ml-auto">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

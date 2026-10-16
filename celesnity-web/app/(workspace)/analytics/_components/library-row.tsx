'use client';

import Link from 'next/link';
import { BarChart3Icon, LayoutDashboardIcon, SparklesIcon } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';

export interface LibraryItem {
  readonly id: string;
  readonly kind: 'CHART' | 'DASHBOARD';
  readonly title: string;
  readonly description: string | null;
  readonly collectionId: string;
  readonly updatedAt: string;
  readonly href: string;
  readonly fromChat?: boolean;
}

/**
 * One saved object in the library.
 *
 * The row names its collection, which the old design could not: the collection
 * *was* the page, so every row in it was redundant with the title and no row
 * anywhere could say where it lived. Making the hierarchy a filter rather than
 * a destination is what buys this column.
 */
export function LibraryRow({
  item,
  collectionName,
  locale,
  questionLabel,
  dashboardLabel,
  fromChatLabel,
}: {
  readonly item: LibraryItem;
  readonly collectionName: string | null;
  readonly locale: string;
  readonly questionLabel: string;
  readonly dashboardLabel: string;
  readonly fromChatLabel: string;
}) {
  const Icon = item.kind === 'DASHBOARD' ? LayoutDashboardIcon : BarChart3Icon;
  const kindLabel = item.kind === 'DASHBOARD' ? dashboardLabel : questionLabel;
  return (
    <Link
      href={item.href}
      className="flex min-w-0 items-start gap-3 px-4 py-3 transition-colors hover:bg-accent"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mt-0.5 inline-flex shrink-0 text-muted-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{kindLabel}</TooltipContent>
      </Tooltip>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">{item.title}</span>
          {item.fromChat ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <SparklesIcon aria-hidden="true" /> {fromChatLabel}
            </Badge>
          ) : null}
        </span>
        {/* A plain span, not `ItemDescription`: that is `line-clamp-2` and would
            let one row grow to twice the height of its neighbours. */}
        {item.description ? (
          <span className="mt-0.5 block truncate text-body-sm text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {collectionName ? (
        <span className="hidden w-32 shrink-0 truncate text-right text-body-sm text-muted-foreground md:block">
          {collectionName}
        </span>
      ) : null}
      <span className="hidden w-20 shrink-0 text-right text-body-sm text-muted-foreground tabular-nums sm:block">
        {formatRelative(item.updatedAt, locale)}
      </span>
    </Link>
  );
}

/**
 * "2d" beats "Sep 14, 2026" in a list you scan for the freshest thing. The
 * absolute date stays in the title attribute for anyone who needs it.
 */
function formatRelative(value: string, locale: string): string {
  const then = new Date(value).valueOf();
  if (Number.isNaN(then)) return value;
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days < 1) return new Intl.RelativeTimeFormat(locale, { style: 'narrow' }).format(0, 'day');
  if (days < 30) {
    return new Intl.RelativeTimeFormat(locale, { style: 'narrow' }).format(-days, 'day');
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(then);
}

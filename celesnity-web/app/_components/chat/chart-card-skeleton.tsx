'use client';

import { Skeleton } from '@/app/_components/ui/skeleton';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

import type { MessageBlock, ToolActivity } from './types';

/**
 * The chart card's fixed geometry, shared with the skeleton that stands in
 * for it: a header one title and one caption tall, and a plot of one height.
 * The card that replaces the skeleton lands on the same pixels, so the text
 * under it does not move when the chart arrives.
 */
export const CHART_CARD_HEADER_CLASS = 'min-h-17';
/** `ChartView` draws 320px tall by default; the box is that tall so no axis is cut. */
export const CHART_CARD_PLOT_CLASS = 'h-80';

const PREVIEW_CHART = /(?:^|__)preview_chart$/u;

/**
 * How many chart cards this turn still owes: the previews the agent asked
 * for, less the chart blocks that have landed. A preview that failed owes
 * nothing. The block travels on its own channel a moment after the tool
 * returns, so a call that has finished still counts until its block shows up.
 */
export function pendingChartCount(
  toolActivity: readonly ToolActivity[],
  blocks: readonly MessageBlock[],
): number {
  const asked = toolActivity.filter(
    (tool) => PREVIEW_CHART.test(tool.name) && tool.status !== 'failed',
  ).length;
  const landed = blocks.filter((block) => block.blockType === 'chart').length;
  return Math.max(0, asked - landed);
}

/**
 * One slot per chart the turn is showing or still owes, pinned to the prose
 * that announced it. The n-th chart block is the result of the n-th preview
 * call that did not fail, so the two lists zip: a slot with a block draws the
 * card, a slot without one draws the placeholder while the turn is live, and
 * either lands after the sentence its call was pinned to. A block with no
 * call to pin it to (a turn restored without its events) carries no anchor
 * and renders after the prose.
 */
export interface ChartSlot {
  readonly key: string;
  readonly block?: MessageBlock;
  readonly anchor?: string;
  readonly offset?: number;
}

export function chartSlots(
  toolActivity: readonly ToolActivity[],
  blocks: readonly MessageBlock[],
  live: boolean,
): readonly ChartSlot[] {
  const calls = toolActivity.filter(
    (tool) => PREVIEW_CHART.test(tool.name) && tool.status !== 'failed',
  );
  const charts = blocks.filter((block) => block.blockType === 'chart');
  const count = live ? Math.max(calls.length, charts.length) : charts.length;
  const slots: ChartSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const call = calls[index];
    const block = charts[index];
    slots.push({
      key: block === undefined ? `pending-chart:${index}` : `block:${block.id}`,
      ...(block === undefined ? {} : { block }),
      ...(call?.textAnchor === undefined ? {} : { anchor: call.textAnchor }),
      ...(call?.textOffset === undefined ? {} : { offset: call.textOffset }),
    });
  }
  return slots;
}

/**
 * Where a chart is about to be. Before this, the agent's sentence sat alone
 * while the query ran, and the card then pushed everything under it down by
 * its own height the moment it arrived.
 */
export function ChartCardSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t('chat.chart.drawing')}
      data-slot="chart-card-skeleton"
      className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 border-b border-border px-4 py-3',
          CHART_CARD_HEADER_CLASS,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="p-4">
        <Skeleton className={cn('w-full', CHART_CARD_PLOT_CLASS)} />
      </div>
    </div>
  );
}

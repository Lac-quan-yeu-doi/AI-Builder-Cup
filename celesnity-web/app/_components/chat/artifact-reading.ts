import type { ChartViewModel } from '@/src/entities/models/chart-renderer';
import type { TranslationKey } from '@/app/_i18n/en';

import type { TableBlockContent } from './message-block-content';

export interface ArtifactReading {
  readonly key: TranslationKey;
  readonly params: Readonly<Record<string, string>>;
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/**
 * One sentence saying what the chart shows.
 *
 * It sits where an instruction used to, because the space beside an answer is
 * worth a fact rather than a reminder of how the product works. The reading is
 * arithmetic on the rows actually drawn, so it can never claim something the
 * picture does not: the leader is the largest total, the laggard the smallest,
 * and a single series is described by where it peaked and where it fell.
 *
 * `partial` switches to a phrasing that names the reading as being about the
 * rows on screen. A result that hit the analytical limit is a sample, and a
 * sentence that states a leader without saying so is the kind of wrong nobody
 * catches.
 */
export function readChartView(
  view: ChartViewModel,
  locale: string,
  partial: boolean,
): ArtifactReading | null {
  const keys = view.series.map((series) => series.key);
  if (view.rows.length === 0 || keys.length === 0) return null;

  if (keys.length === 1) {
    const measure = keys[0] ?? '';
    const axis = view.x.dataKey ?? '';
    let peak = { at: '', value: Number.NEGATIVE_INFINITY };
    let trough = { at: '', value: Number.POSITIVE_INFINITY };
    for (const row of view.rows) {
      const value = row[measure];
      if (typeof value !== 'number') continue;
      const at = String(row[axis] ?? '');
      if (value > peak.value) peak = { at, value };
      if (value < trough.value) trough = { at, value };
    }
    if (peak.at === '' || trough.at === peak.at) return null;
    return {
      key: partial ? 'chat.artifact.reading.rangePartial' : 'chat.artifact.reading.range',
      params: {
        peak: formatNumber(peak.value, locale),
        peakAt: peak.at,
        trough: formatNumber(trough.value, locale),
        troughAt: trough.at,
      },
    };
  }

  const totals = view.series.map((series) => ({
    label: series.label,
    total: view.rows.reduce((sum, row) => {
      const value = row[series.key];
      return sum + (typeof value === 'number' ? value : 0);
    }, 0),
  }));
  const ranked = [...totals].sort((left, right) => right.total - left.total);
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];
  if (leader === undefined || laggard === undefined || leader.label === laggard.label) return null;
  if (leader.total === 0) return null;

  return {
    key: partial ? 'chat.artifact.reading.leaderPartial' : 'chat.artifact.reading.leader',
    params: {
      leader: leader.label,
      total: formatNumber(leader.total, locale),
      laggard: laggard.label,
      spread: `${Math.round(((leader.total - laggard.total) / leader.total) * 100)}`,
    },
  };
}

/**
 * One sentence saying what the rows amount to.
 *
 * It names where the rows pile up, since a list of eighteen orders is read as
 * "who has most of them" long before it is read row by row. The column worth
 * grouping by is the one that repeats: an order number is text too, and it is
 * different on every row, so grouping by it says only that eighteen orders are
 * eighteen orders.
 */
export function readTableContent(
  content: TableBlockContent,
  locale: string,
  partial: boolean,
): ArtifactReading | null {
  if (content.rows.length === 0) return null;

  let best: { readonly column: string; readonly leader: string; readonly count: number } | null =
    null;

  for (const column of content.columns) {
    if (column.numeric) continue;
    const counts = new Map<string, number>();
    for (const row of content.rows) {
      const value = row[column.key];
      if (value === null || value === undefined || value === '') continue;
      const label = String(value);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    if (counts.size < 2 || counts.size === content.rows.length) continue;
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const leader = ranked[0];
    if (leader === undefined || leader[1] < 2) continue;
    if (best === null || leader[1] > best.count) {
      best = { column: column.label.toLowerCase(), leader: leader[0], count: leader[1] };
    }
  }

  if (best === null) return null;

  return {
    key: partial ? 'chat.artifact.reading.topPartial' : 'chat.artifact.reading.top',
    params: {
      leader: best.leader,
      count: formatNumber(best.count, locale),
      total: formatNumber(content.rows.length, locale),
      column: best.column,
    },
  };
}

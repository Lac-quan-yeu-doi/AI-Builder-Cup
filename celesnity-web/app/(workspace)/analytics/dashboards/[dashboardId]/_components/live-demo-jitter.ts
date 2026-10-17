/**
 * Demo-only movement for dashboard numbers.
 *
 * This is **presentation theatre, not streaming**. The data still comes from a
 * single `POST /dashboards/:id/execute`; everything here drifts those values in
 * the browser so a recorded walkthrough looks like a plant that is running. It
 * is switched on for exactly one surface — the default dashboard embedded in
 * the plant overview — and only for the demo sites in `isLiveDemoSite`, so a
 * real customer site never shows invented movement. Every identifier carries
 * `liveDemo` so nobody later mistakes it for a real-time pipeline.
 *
 * The movement has to look like a factory rather than like noise, which is what
 * the rules below are for:
 *
 *  - values drift along a slow sine with a per-cell phase, so the board does not
 *    breathe in unison and no number teleports;
 *  - amplitude follows what the column means — a percentage moves a few tenths,
 *    a ratio a percent, a running count only ever goes up;
 *  - strings and dates never change, because a moving axis label reshuffles the
 *    chart underneath it;
 *  - row order is never touched, because a Pareto whose bars swap places every
 *    second reads as a broken product.
 */
import type { OutputColumn } from '@/src/entities/models/canonical-chart';
import type { DashboardChartRuntimeResult } from '@/src/entities/models/dashboard-runtime';

/** How a column is allowed to move. */
export type LiveDemoColumnKind = 'percentage' | 'counter' | 'ratio' | 'quantity' | 'frozen';

/*
 * Matched against the column names the Demo Data 1 / Demo Data 2 charts return
 * (mock-data/*/charts.mjs). Percent hints are checked first, then ratios, then
 * running counts.
 */
const PERCENT_HINTS = [
  'oee',
  'fpy',
  'otd',
  'pct',
  'percent',
  'attainment',
  'availability',
  'quality',
  'adherence',
  'yield',
];
const COUNTER_HINTS = [
  'output',
  'qty',
  'quantity',
  'count',
  'boxes',
  'capsules',
  'downtime_hours',
  'minutes',
  'good',
  'total',
  'completed',
];
const RATIO_HINTS = [
  'per_unit',
  'kwh',
  'temperature',
  'avg',
  'cpk',
  'days_of',
  'rate',
  'cycle_time',
  'rh',
  'amps',
  'vibration',
  'kg',
];

/**
 * Plant sites whose overview board may move. Demo sites only: Demo Data 1 and
 * Demo Data 2 (see mock-data/). `NEXT_PUBLIC_LIVE_DEMO_SITES` (comma-separated
 * site codes) replaces the list; set it empty to switch the movement off everywhere.
 */
const DEFAULT_LIVE_DEMO_SITES = 'DEMO1_HOME_APPLIANCE,DEMO2_COFFEE_CAPSULES';

export function isLiveDemoSite(
  siteCode: string | undefined,
  configured: string | undefined = process.env.NEXT_PUBLIC_LIVE_DEMO_SITES,
): boolean {
  if (siteCode === undefined) return false;
  const codes = (configured ?? DEFAULT_LIVE_DEMO_SITES)
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code !== '');
  return codes.includes(siteCode.toUpperCase());
}

/**
 * Classifies a column from its declared family and its name.
 *
 * The family alone is not enough: `oee`, `output_qty` and `kwh_per_unit` are all
 * NUMBER, but a percentage that wanders a full percent looks broken while a
 * running count that ever decreases looks fake.
 */
export function liveDemoColumnKind(column: OutputColumn): LiveDemoColumnKind {
  if (column.family !== 'NUMBER') return 'frozen';
  const name = column.name.toLowerCase();
  if (PERCENT_HINTS.some((hint) => name.includes(hint))) return 'percentage';
  if (RATIO_HINTS.some((hint) => name.includes(hint))) return 'ratio';
  if (COUNTER_HINTS.some((hint) => name.includes(hint))) return 'counter';
  return 'quantity';
}

/** Deterministic 0..1 from a string, so a take is reproducible across runs. */
function seed(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) % 100_000) / 100_000;
}

/*
 * Tuned against the rendered cards, not in the abstract. A percentage shown to
 * one decimal needs roughly a percent of relative movement before the digit
 * ever changes — at a few tenths the number is technically drifting and
 * visibly frozen, which is the worst of both.
 */
const AMPLITUDE: Readonly<Record<LiveDemoColumnKind, number>> = {
  percentage: 0.012,
  ratio: 0.018,
  quantity: 0.02,
  counter: 0,
  frozen: 0,
};

/**
 * One cell's displayed value at a given moment.
 *
 * `elapsed` is seconds since the board mounted rather than a wall clock, so the
 * drift starts from the real number and a reload does not jump.
 */
export function liveDemoValue(
  base: number,
  kind: LiveDemoColumnKind,
  cellSeed: number,
  elapsed: number,
): number {
  if (kind === 'frozen') return base;
  if (kind === 'counter') {
    /* A running count only climbs, and slowly enough to read. */
    const perSecond = Math.max(base * 0.0006, 0.12);
    return base + perSecond * elapsed * (0.6 + cellSeed * 0.8);
  }
  const period = 4 + cellSeed * 6;
  const phase = cellSeed * Math.PI * 2;
  const wave = Math.sin((elapsed / period) * Math.PI * 2 + phase);
  const ripple = Math.sin((elapsed / 1.6) * Math.PI * 2 + phase * 1.7) * 0.3;
  /*
   * Eases in over the first few seconds so the board opens on the numbers Core
   * actually returned. Without it each cell starts wherever its own phase puts
   * it, and the first frame a viewer sees is already a little bit invented.
   */
  const easeIn = Math.min(1, elapsed / 3);
  return base * (1 + AMPLITUDE[kind] * easeIn * (wave + ripple));
}

/** How often a trend slides one point to the left. */
const ROLL_SECONDS = 1;

/** Longest live window a trend is given, in seconds. */
const WINDOW_SECONDS = 60;

/*
 * Only an intraday axis becomes a clock. A daily or monthly chart is history the
 * presenter talks over ("the step in March"); rolling it into seconds, or
 * wobbling its values under a fixed calendar, both misstate it.
 */
const isTemporal = (column: OutputColumn | undefined): boolean => column?.family === 'TIMESTAMP';

const clockLabel = (atMs: number): string =>
  new Date(atMs).toLocaleTimeString('vi-VN', { hour12: false });

/**
 * Turns a historical trend into a live one.
 *
 * Two things happen here, and both matter.
 *
 * The time column is rewritten as a rolling clock — one point per second,
 * ending now — because a board whose numbers move while its axis stays on
 * yesterday's calendar hours is not live, it is broken. The warehouse has no
 * per-second grain to offer, so the real series supplies the values: the window
 * walks through it and wraps, which keeps the peaks, the troughs and the
 * magnitudes the plant actually produces.
 *
 * Values are taken **within each series**, never across them. Results arrive in
 * long form — `(hour, line, quantity)` — and rotating the whole row list hands
 * one line's readings to another, which is what turned three clean production
 * curves into noise crossing itself.
 */
function liveDemoTrend(
  result: DashboardChartRuntimeResult,
  kinds: readonly LiveDemoColumnKind[],
  elapsed: number,
  nowMs: number,
): DashboardChartRuntimeResult | undefined {
  if (nowMs === 0 || !isTemporal(result.columns[0]) || result.rows.length < 6) return undefined;

  const seriesIndex = result.columns.findIndex(
    (column, index) => index > 0 && column.family === 'STRING',
  );
  const groups = new Map<string, DashboardChartRuntimeResult['rows'][number][]>();
  for (const row of result.rows) {
    const key = seriesIndex === -1 ? '' : String(row[seriesIndex] ?? '');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const longest = Math.max(...[...groups.values()].map((rows) => rows.length));
  const points = Math.min(WINDOW_SECONDS, longest);
  const steps = Math.floor(elapsed / ROLL_SECONDS);
  const rows: DashboardChartRuntimeResult['rows'][number][] = [];

  for (let point = 0; point < points; point += 1) {
    const at = clockLabel(nowMs - (points - 1 - point) * ROLL_SECONDS * 1_000);
    for (const [key, groupRows] of groups) {
      const source = groupRows[(point + steps) % groupRows.length];
      if (source === undefined) continue;
      rows.push(
        result.columns.map((_column, columnIndex) => {
          if (columnIndex === 0) return at;
          if (columnIndex === seriesIndex) return key;
          return source[columnIndex] ?? null;
        }),
      );
    }
  }
  void kinds;
  return { ...result, rows, rowCount: rows.length };
}

/**
 * A card's result as it should appear now.
 *
 * Returns the original object when nothing can move, so React skips the
 * re-render for a card made entirely of labels.
 */
export function liveDemoResult(
  result: DashboardChartRuntimeResult,
  cardId: string,
  elapsed: number,
  nowMs = 0,
): DashboardChartRuntimeResult {
  if (result.columns[0]?.family === 'DATE') return result;
  const kinds = result.columns.map(liveDemoColumnKind);
  const trend = liveDemoTrend(result, kinds, elapsed, nowMs);
  const base = trend ?? result;
  if (trend === undefined && kinds.every((kind) => kind === 'frozen')) return result;

  return {
    ...base,
    rows: base.rows.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        const kind = kinds[columnIndex] ?? 'frozen';
        if (kind === 'frozen' || typeof cell !== 'number') return cell;
        const cellSeed = seed(`${cardId}:${rowIndex}:${columnIndex}`);
        return liveDemoValue(cell, kind, cellSeed, elapsed);
      }),
    ),
  };
}

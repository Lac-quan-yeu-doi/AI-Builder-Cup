import { describe, expect, it } from 'vitest';

import {
  isLiveDemoSite,
  liveDemoColumnKind,
  liveDemoResult,
  liveDemoValue,
} from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/live-demo-jitter';
import type { OutputColumn } from '@/src/entities/models/canonical-chart';
import type { DashboardChartRuntimeResult } from '@/src/entities/models/dashboard-runtime';

const column = (name: string, family: OutputColumn['family']): OutputColumn => ({
  name,
  type: family === 'NUMBER' ? 'double' : 'varchar',
  family,
});

const result: DashboardChartRuntimeResult = {
  runId: 'run-1',
  columns: [
    column('station', 'STRING'),
    column('oee', 'NUMBER'),
    column('output', 'NUMBER'),
    column('day', 'DATE'),
  ],
  rows: [
    ['PU foam', 84.4, 802, '2026-09-16'],
    ['Coil winding', 84.28, 640, '2026-09-16'],
  ],
  rowCount: 2,
};

describe('live demo jitter', () => {
  it('reads what a column means from its family and its name', () => {
    expect(liveDemoColumnKind(column('oee', 'NUMBER'))).toBe('percentage');
    expect(liveDemoColumnKind(column('output', 'NUMBER'))).toBe('counter');
    expect(liveDemoColumnKind(column('kwh_per_unit', 'NUMBER'))).toBe('ratio');
    expect(liveDemoColumnKind(column('station', 'STRING'))).toBe('frozen');
    expect(liveDemoColumnKind(column('day', 'DATE'))).toBe('frozen');
  });

  it('never moves a label or a date', () => {
    for (const elapsed of [1, 7, 45, 300]) {
      const moved = liveDemoResult(result, 'card-a', elapsed);
      expect(moved.rows.map((row) => row[0])).toEqual(['PU foam', 'Coil winding']);
      expect(moved.rows.map((row) => row[3])).toEqual(['2026-09-16', '2026-09-16']);
    }
  });

  /* A production count that ever drops is the tell that the board is faked. */
  it('only ever increases a running count', () => {
    let previous = -Infinity;
    for (let elapsed = 0; elapsed <= 600; elapsed += 3) {
      const value = liveDemoResult(result, 'card-a', elapsed).rows[0]?.[2] as number;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('keeps a percentage within a few tenths of its real value', () => {
    for (let elapsed = 0; elapsed <= 600; elapsed += 1) {
      const value = liveDemoResult(result, 'card-a', elapsed).rows[0]?.[1] as number;
      expect(Math.abs(value - 84.4)).toBeLessThan(84.4 * 0.02);
    }
  });

  it('holds row order and shape', () => {
    const moved = liveDemoResult(result, 'card-a', 12);
    expect(moved.rows).toHaveLength(result.rows.length);
    expect(moved.columns).toEqual(result.columns);
    expect(moved.rowCount).toBe(result.rowCount);
  });

  /* Takes have to be reproducible, so nothing here may read a real clock. */
  it('gives the same numbers for the same card and moment', () => {
    expect(liveDemoResult(result, 'card-a', 30)).toEqual(liveDemoResult(result, 'card-a', 30));
    expect(liveDemoResult(result, 'card-b', 30).rows[0]?.[1]).not.toBe(
      liveDemoResult(result, 'card-a', 30).rows[0]?.[1],
    );
  });

  it('returns the original object when a card is all labels', () => {
    const labels: DashboardChartRuntimeResult = {
      ...result,
      columns: [column('station', 'STRING')],
      rows: [['PU foam']],
    };
    expect(liveDemoResult(labels, 'card-a', 20)).toBe(labels);
  });

  it('leaves a value untouched at the moment the board mounts', () => {
    expect(liveDemoValue(84.4, 'percentage', 0.5, 0)).toBeCloseTo(84.4, 1);
  });
});

describe('live demo time series', () => {
  /* One hour of history per line, in the long shape a grouped query returns. */
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
  const trend: DashboardChartRuntimeResult = {
    runId: 'run-2',
    columns: [
      column('gio', 'TIMESTAMP'),
      column('day_chuyen', 'STRING'),
      column('oee_gio', 'NUMBER'),
    ],
    rows: hours.flatMap((hour, index) => [
      [hour, 'Steel lid', 10 + index],
      [hour, 'Glass top', 50 + index],
    ]),
    rowCount: 14,
  };
  const NOW = Date.UTC(2026, 8, 17, 3, 0, 0);

  it("rewrites the axis as a clock, not yesterday's calendar hours", () => {
    const moved = liveDemoResult(trend, 'card-t', 5, NOW);
    const labels = [...new Set(moved.rows.map((row) => String(row[0])))];
    expect(labels).toHaveLength(hours.length);
    for (const label of labels) expect(label).toMatch(/^\d{2}:\d{2}:\d{2}$/u);
    expect(labels).toEqual([...labels].sort());
  });

  /* The clock has to travel with the values, or the board contradicts itself. */
  it('moves the clock forward as time passes', () => {
    const first = liveDemoResult(trend, 'card-t', 5, NOW).rows.at(-1)?.[0];
    const later = liveDemoResult(trend, 'card-t', 9, NOW + 4_000).rows.at(-1)?.[0];
    expect(first).not.toEqual(later);
  });

  /* Rotating across the whole row list hands one line's readings to another. */
  it('keeps each series to its own readings', () => {
    const moved = liveDemoResult(trend, 'card-t', 3, NOW);
    const steel = moved.rows.filter((row) => row[1] === 'Steel lid').map((row) => row[2] as number);
    const glass = moved.rows.filter((row) => row[1] === 'Glass top').map((row) => row[2] as number);
    expect(steel.every((value) => value < 30)).toBe(true);
    expect(glass.every((value) => value > 40)).toBe(true);
  });

  it('leaves a category chart alone', () => {
    const categorical: DashboardChartRuntimeResult = {
      runId: 'run-3',
      columns: [column('station', 'STRING'), column('oee_gio', 'NUMBER')],
      rows: [
        ['PU foam', 10],
        ['Coil winding', 20],
        ['Gas charge', 30],
        ['Packing', 40],
        ['Final QC', 50],
        ['Press', 60],
      ],
      rowCount: 6,
    };
    const moved = liveDemoResult(categorical, 'card-c', 3, NOW);
    expect(moved.rows.map((row) => row[0])).toEqual([
      'PU foam',
      'Coil winding',
      'Gas charge',
      'Packing',
      'Final QC',
      'Press',
    ]);
    expect(Math.round(moved.rows[0]?.[1] as number)).toBe(10);
  });

  it('does not touch a series too short to read as a trend', () => {
    const short: DashboardChartRuntimeResult = {
      runId: 'run-4',
      columns: [column('gio', 'TIMESTAMP'), column('oee_gio', 'NUMBER')],
      rows: [
        ['06:00', 10],
        ['07:00', 20],
      ],
      rowCount: 2,
    };
    expect(liveDemoResult(short, 'card-s', 6, NOW).rows.map((row) => row[0])).toEqual([
      '06:00',
      '07:00',
    ]);
  });
});

describe('live demo scope', () => {
  it('moves only the demo sites, and an empty setting switches it off', () => {
    expect(isLiveDemoSite('DEMO1_HOME_APPLIANCE', undefined)).toBe(true);
    expect(isLiveDemoSite('demo2_coffee_capsules', undefined)).toBe(true);
    expect(isLiveDemoSite('CUSTOMER_LINE_2', undefined)).toBe(false);
    expect(isLiveDemoSite(undefined, undefined)).toBe(false);
    expect(isLiveDemoSite('DEMO1_HOME_APPLIANCE', '')).toBe(false);
    expect(isLiveDemoSite('CUSTOMER_X', 'CUSTOMER_X, DEMO1_HOME_APPLIANCE')).toBe(true);
  });

  it('leaves a daily chart exactly as Core returned it', () => {
    const daily: DashboardChartRuntimeResult = {
      runId: 'run-5',
      columns: [column('day', 'DATE'), column('fpy', 'NUMBER')],
      rows: Array.from({ length: 8 }, (_, index) => [`2026-09-${10 + index}`, 94 + index / 10]),
      rowCount: 8,
    };
    expect(liveDemoResult(daily, 'card-d', 7, Date.UTC(2026, 8, 17))).toBe(daily);
  });

  it('reads the demo chart column names', () => {
    expect(liveDemoColumnKind(column('cpk', 'NUMBER'))).toBe('ratio');
    expect(liveDemoColumnKind(column('attainment', 'NUMBER'))).toBe('percentage');
    expect(liveDemoColumnKind(column('yield_pct', 'NUMBER'))).toBe('percentage');
    expect(liveDemoColumnKind(column('boxes', 'NUMBER'))).toBe('counter');
    expect(liveDemoColumnKind(column('rh', 'NUMBER'))).toBe('ratio');
  });
});

import { describe, expect, it } from 'vitest';

import { RechartsChartRenderer } from '@/src/infrastructure/visualization/recharts-chart-renderer.service';

const columns = [
  { name: 'region', type: 'varchar', family: 'STRING' as const },
  { name: 'revenue', type: 'double', family: 'NUMBER' as const },
];

const quarterColumns = [
  { name: 'quarter', type: 'varchar', family: 'STRING' as const },
  { name: 'region', type: 'varchar', family: 'STRING' as const },
  { name: 'revenue', type: 'double', family: 'NUMBER' as const },
];

function renderer() {
  return new RechartsChartRenderer();
}

describe('RechartsChartRenderer', () => {
  it('compiles a donut definition, keeping the radius as a fraction', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'PIE',
        roles: { measure: 'revenue', breakout: 'region' },
        display: { variant: 'DONUT', showLegend: true },
      },
      columns,
      [['west', 12]],
    );

    expect(view).toMatchObject({
      mark: 'PIE',
      categoryKey: 'region',
      innerRadius: 0.56,
      showLegend: true,
    });
    expect(view?.y.dataKey).toBe('revenue');
  });

  it('keeps table and number rendering outside the chart renderer', () => {
    expect(
      renderer().compile(
        { schemaVersion: 1, type: 'TABLE', roles: { columns: ['region'] }, display: {} },
        columns,
        [['west', 12]],
      ),
    ).toBeNull();
    expect(
      renderer().compile(
        { schemaVersion: 1, type: 'NUMBER', roles: { measure: 'revenue' }, display: {} },
        columns,
        [['west', 12]],
      ),
    ).toBeNull();
  });

  it('colours a single bar series from the first categorical slot, as a token', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'BAR',
        roles: { category: 'region', measures: ['revenue'] },
        display: { orientation: 'VERTICAL', stacking: 'NONE' },
      },
      columns,
      [['west', 12]],
    );

    expect(view?.series).toEqual([{ key: 'revenue', label: 'revenue', color: 'var(--mchart-1)' }]);
    // The point of the migration: no literal colour reaches the chart.
    expect(JSON.stringify(view)).not.toContain('#');
  });

  it('assigns palette slots in order and never cycles back to slot 1', () => {
    const many = Array.from({ length: 9 }, (_, index) => [`s${index}`, index] as const);
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'BAR',
        roles: { category: 'region', measures: ['revenue'], breakout: 'region' },
        display: {},
      },
      columns,
      many.map(([name, value]) => [name, value]),
    );

    const colors = view?.series.map((s) => s.color) ?? [];
    expect(colors.slice(0, 7)).toEqual([
      'var(--mchart-1)',
      'var(--mchart-2)',
      'var(--mchart-3)',
      'var(--mchart-4)',
      'var(--mchart-5)',
      'var(--mchart-6)',
      'var(--mchart-7)',
    ]);
    // Everything past the seventh folds into "Other" rather than reusing a slot.
    expect(colors.slice(7)).toEqual(['var(--mchart-8)', 'var(--mchart-8)']);
    expect(view?.series.slice(7).map((s) => s.label)).toEqual(['Other', 'Other']);
  });

  it('lets a user-picked colour win over the palette slot', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'BAR',
        roles: { category: 'region', measures: ['revenue'] },
        display: { colors: { byField: { revenue: '#0075DE' } } },
      },
      columns,
      [['west', 12]],
    );

    expect(view?.series[0]?.color).toBe('#0075DE');
  });

  it('pivots a broken-out series into one column per series', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'LINE',
        roles: { x: 'quarter', measures: ['revenue'], series: 'region' },
        display: {},
      },
      quarterColumns,
      [
        ['Q1', 'west', 10],
        ['Q1', 'east', 20],
        ['Q2', 'west', 30],
        ['Q2', 'east', 40],
      ],
    );

    expect(view?.rows).toEqual([
      { quarter: 'Q1', west: 10, east: 20 },
      { quarter: 'Q2', west: 30, east: 40 },
    ]);
    expect(view?.series.map((s) => s.key)).toEqual(['west', 'east']);
    expect(view?.showLegend).toBe(true);
  });

  it('carries axis settings through, including a log scale and its bounds', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'SCATTER',
        roles: { x: 'region', y: 'revenue' },
        display: { axes: { y: { scale: 'LOG', min: 1, max: 100, title: 'Revenue' } } },
      },
      columns,
      [['west', 12]],
    );

    expect(view?.y).toMatchObject({ scale: 'LOG', min: 1, max: 100, title: 'Revenue' });
  });

  it('treats a horizontal bar as an orientation, not a different chart', () => {
    const view = renderer().compile(
      {
        schemaVersion: 1,
        type: 'BAR',
        roles: { category: 'region', measures: ['revenue'] },
        display: { orientation: 'HORIZONTAL', stacking: 'STACKED' },
      },
      columns,
      [['west', 12]],
    );

    expect(view).toMatchObject({ mark: 'BAR', orientation: 'HORIZONTAL', stacked: true });
  });
});

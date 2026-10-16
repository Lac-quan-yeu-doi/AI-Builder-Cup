import type {
  ChartAxisView,
  ChartRenderer,
  ChartRow,
  ChartSeries,
  ChartViewModel,
} from '@/src/entities/models/chart-renderer';
import type {
  ActiveChartResult,
  AxisSettings,
  ColorSettings,
  OutputColumn,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';

/**
 * The categorical palette, in slot order.
 *
 * The slot ORDER is the separation mechanism: assign 1..N in sequence and never
 * cycle. Past the eighth series the design system's rule is that everything else
 * folds into "Other", which is what `--mchart-8` is reserved for — so this never
 * wraps back to slot 1 and hands two different series the same colour.
 */
const CATEGORICAL = [
  'var(--mchart-1)',
  'var(--mchart-2)',
  'var(--mchart-3)',
  'var(--mchart-4)',
  'var(--mchart-5)',
  'var(--mchart-6)',
  'var(--mchart-7)',
] as const;

/** Slot 8 — "Other", and the colour any series past the seventh collapses into. */
const OTHER = 'var(--mchart-8)';

export const OTHER_SERIES_LABEL = 'Other';

/**
 * Builds a renderer-agnostic view model from a chart's stored definition.
 *
 * This replaced a Vega-Lite spec compiler. Two things drove the change: the old
 * port returned a `TopLevelSpec`, which pulled Vega's vocabulary into
 * `src/entities`; and Vega draws to `<canvas>`, so a chart could never read a
 * CSS custom property and therefore could never follow the theme. Colours below
 * are emitted as `var(--mchart-N)` and resolve at paint time.
 */
export class RechartsChartRenderer implements ChartRenderer {
  public compile(
    definition: VisualizationDefinition,
    columns: readonly OutputColumn[],
    rows: ActiveChartResult['rows'],
  ): ChartViewModel | null {
    if (definition.type === 'TABLE' || definition.type === 'NUMBER') return null;

    const data = rows.map((row) => rowObject(columns, row));

    switch (definition.type) {
      case 'PIE': {
        const { measure, breakout } = definition.roles;
        const slices = data.map((row) => String(row[breakout] ?? ''));
        return {
          mark: 'PIE',
          rows: data,
          series: assignColors(slices, definition.display.colors),
          x: axisView(breakout, undefined),
          y: axisView(measure, undefined),
          categoryKey: breakout,
          showLegend: definition.display.showLegend !== false,
          stacked: false,
          orientation: 'VERTICAL',
          markers: false,
          innerRadius:
            definition.display.variant === 'DONUT' ? (definition.display.donutRadius ?? 0.56) : 0,
        };
      }

      case 'BAR': {
        const { category, measures, breakout } = definition.roles;
        // A breakout splits one measure into a series per distinct value; without
        // one, each selected measure is its own series.
        const keys = breakout ? distinct(data, breakout) : [...measures];
        const horizontal = definition.display.orientation === 'HORIZONTAL';
        return {
          mark: 'BAR',
          rows: breakout ? pivot(data, category, breakout, measures[0] ?? '') : data,
          series: assignColors(keys, definition.display.colors),
          x: axisView(category, definition.display.axes?.x, definition.display.gridlines),
          y: axisView(undefined, definition.display.axes?.y, definition.display.gridlines),
          showLegend: definition.display.showLegend !== false && keys.length > 1,
          stacked: isStacked(definition.display.stacking),
          orientation: horizontal ? 'HORIZONTAL' : 'VERTICAL',
          markers: false,
        };
      }

      case 'LINE':
      case 'AREA': {
        const { x, measures, series } = definition.roles;
        const keys = series ? distinct(data, series) : [...measures];
        return {
          mark: definition.type,
          rows: series ? pivot(data, x, series, measures[0] ?? '') : data,
          series: assignColors(keys, definition.display.colors),
          x: axisView(x, definition.display.axes?.x, definition.display.gridlines),
          y: axisView(undefined, definition.display.axes?.y, definition.display.gridlines),
          showLegend: definition.display.showLegend !== false && keys.length > 1,
          stacked:
            definition.type === 'AREA' &&
            isStacked((definition.display as { readonly stacking?: string }).stacking),
          orientation: 'VERTICAL',
          markers:
            definition.type === 'LINE' &&
            ((definition.display as { readonly markers?: boolean }).markers ?? false),
          opacity: definition.type === 'AREA' ? (definition.display.opacity ?? 0.7) : undefined,
        };
      }

      case 'SCATTER': {
        const { x, y, series, size } = definition.roles;
        const keys = series ? distinct(data, series) : [y];
        return {
          mark: 'SCATTER',
          rows: data,
          series: assignColors(keys, definition.display.colors),
          x: axisView(x, definition.display.axes?.x, definition.display.gridlines),
          y: axisView(y, definition.display.axes?.y, definition.display.gridlines),
          showLegend: definition.display.showLegend !== false && keys.length > 1,
          stacked: false,
          orientation: 'VERTICAL',
          markers: false,
          opacity: definition.display.opacity ?? 0.8,
          pointSize: definition.display.pointSize ?? 60,
          sizeKey: size,
        };
      }
    }
  }
}

/**
 * Hands each key a palette slot in order.
 *
 * A hex the user picked for a field wins over the slot — those are stored on the
 * chart (`display.colors.byField`) and are an explicit choice, not a default to
 * migrate away. `palette` is not read: the four named palettes it could hold
 * were Vega scheme names with no Recharts equivalent, and the validated ramp
 * replaces what they were reaching for.
 */
function assignColors(
  keys: readonly string[],
  colors: ColorSettings | undefined,
): readonly ChartSeries[] {
  return keys.map((key, index) => {
    const picked = colors?.byField?.[key];
    const beyondPalette = index >= CATEGORICAL.length;
    return {
      key,
      label: beyondPalette ? OTHER_SERIES_LABEL : key,
      color: picked ?? (beyondPalette ? OTHER : (CATEGORICAL[index] ?? OTHER)),
    };
  });
}

function isStacked(stacking: string | undefined): boolean {
  return stacking !== undefined && stacking !== 'NONE';
}

function distinct(rows: readonly ChartRow[], field: string): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined) seen.add(String(value));
  }
  return [...seen];
}

/**
 * Turns long rows into wide ones: one row per x value, one column per series.
 *
 * Vega took a `color` encoding and split the data itself. Recharts draws one
 * component per series and reads each from its own key, so the split has to
 * happen here.
 */
function pivot(
  rows: readonly ChartRow[],
  xField: string,
  seriesField: string,
  measureField: string,
): readonly ChartRow[] {
  const byX = new Map<string, ChartRow>();
  for (const row of rows) {
    const xValue = row[xField];
    const key = String(xValue ?? '');
    const existing = byX.get(key) ?? { [xField]: xValue ?? null };
    const seriesName = String(row[seriesField] ?? '');
    byX.set(key, { ...existing, [seriesName]: row[measureField] ?? null });
  }
  return [...byX.values()];
}

function axisView(
  dataKey: string | undefined,
  settings: AxisSettings | undefined,
  gridlinesDefault?: boolean,
): ChartAxisView {
  return {
    dataKey,
    title: settings?.title,
    visible: settings?.visible !== false,
    gridlines: settings?.gridlines ?? gridlinesDefault ?? true,
    scale: settings?.scale,
    min: settings?.min,
    max: settings?.max,
  };
}

function rowObject(
  columns: readonly OutputColumn[],
  row: readonly (string | number | boolean | null)[],
): ChartRow {
  return Object.fromEntries(columns.map((column, index) => [column.name, row[index] ?? null]));
}

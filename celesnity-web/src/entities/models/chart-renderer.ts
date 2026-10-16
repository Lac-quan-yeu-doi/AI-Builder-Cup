import type { ActiveChartResult, OutputColumn, VisualizationDefinition } from './canonical-chart';

/**
 * The shapes a chart can take. Deliberately not a renderer's vocabulary: `PIE`
 * stays `PIE` here rather than becoming Vega's `arc` or Recharts' `Pie`, so the
 * entity layer never has to change when the drawing library does.
 */
export type ChartMark = 'BAR' | 'LINE' | 'AREA' | 'SCATTER' | 'PIE';

/** A row flattened to `{ columnName: value }`, which is what every chart library wants. */
export type ChartRow = Record<string, string | number | boolean | null>;

/**
 * One drawn series. `color` is a resolved CSS value — usually
 * `var(--mchart-N)` so the mark follows the theme, or a literal hex when the
 * user has explicitly picked one for this field.
 */
export interface ChartSeries {
  readonly key: string;
  readonly label: string;
  readonly color: string;
}

export interface ChartAxisView {
  readonly dataKey?: string;
  readonly title?: string;
  readonly visible: boolean;
  readonly gridlines: boolean;
  readonly scale?: 'LINEAR' | 'LOG' | 'POW';
  readonly min?: number;
  readonly max?: number;
}

/**
 * A chart reduced to what any library needs to draw it: rows, series, axes and
 * a handful of display flags.
 *
 * This replaced a Vega-Lite `TopLevelSpec`. The spec carried Vega's whole
 * vocabulary into `src/entities`, which meant the domain depended on a drawing
 * library; it also could not be themed, because Vega renders to `<canvas>` and
 * never reads CSS custom properties. Recharts renders DOM SVG, so a `color` of
 * `var(--mchart-1)` resolves against the live token.
 */
export interface ChartViewModel {
  readonly mark: ChartMark;
  readonly rows: readonly ChartRow[];
  readonly series: readonly ChartSeries[];
  readonly x: ChartAxisView;
  readonly y: ChartAxisView;
  readonly showLegend: boolean;
  readonly stacked: boolean;
  /** BAR only. `HORIZONTAL` swaps the category and measure axes. */
  readonly orientation: 'VERTICAL' | 'HORIZONTAL';
  /** LINE only — draw a dot at each datum. */
  readonly markers: boolean;
  /** AREA fill and SCATTER point opacity, 0–1. */
  readonly opacity?: number;
  /** SCATTER only. */
  readonly pointSize?: number;
  /** SCATTER only — the field driving bubble size, if any. */
  readonly sizeKey?: string;
  /** PIE only — the slice label field. */
  readonly categoryKey?: string;
  /** PIE only — 0 for a full pie, a fraction of the radius for a donut. */
  readonly innerRadius?: number;
}

/** Renderer port exposed as a domain-facing contract; drivers provide the adapter. */
export interface ChartRenderer {
  compile(
    definition: VisualizationDefinition,
    columns: readonly OutputColumn[],
    rows: ActiveChartResult['rows'],
  ): ChartViewModel | null;
}

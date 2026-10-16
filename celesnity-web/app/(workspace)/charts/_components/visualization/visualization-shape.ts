import type { OutputColumn, VisualizationType } from '@/src/entities/models/canonical-chart';

/**
 * What a result's columns can and should be drawn as.
 *
 * `OutputColumn.family` has always been carried through preview results and
 * used for nothing: every query landed on a table, and the only way to a chart
 * was a floating pill labelled "Visualization" at the bottom of the page. One
 * field answers both questions here — which shapes can render this result at
 * all, and which one to open on.
 *
 * Ordering follows the preattentive argument: length and 2-D position are read
 * instantly and accurately, area and angle are not. Bar, line and scatter come
 * before pie and area for that reason, and nothing is removed — a pie chart is
 * a legitimate thing to ask for, just not a good default.
 */

export type ShapeReason = 'MEASURE' | 'CATEGORY' | 'TWO_MEASURES';

export interface VisualizationShapeFit {
  readonly type: VisualizationType;
  readonly available: boolean;
  /** Why it cannot render this result, when it cannot. */
  readonly reason?: ShapeReason;
}

/** Picker order: readable shapes first, then the ones that trade accuracy for familiarity. */
export const visualizationOrder: readonly VisualizationType[] = [
  'TABLE',
  'NUMBER',
  'BAR',
  'LINE',
  'SCATTER',
  'AREA',
  'PIE',
];

function isMeasure(column: OutputColumn): boolean {
  return column.family === 'NUMBER';
}

function isTemporal(column: OutputColumn): boolean {
  return column.family === 'DATE' || column.family === 'TIMESTAMP';
}

function isDimension(column: OutputColumn): boolean {
  return !isMeasure(column);
}

/**
 * The shape to open on for a freshly run result.
 *
 * Only ever applied to the first result of a draft — an explicit choice is
 * never overridden, because a proposal that fights the user is worse than no
 * proposal at all.
 */
export function proposeVisualizationType(columns: readonly OutputColumn[]): VisualizationType {
  const measures = columns.filter(isMeasure);
  const dimensions = columns.filter(isDimension);

  if (columns.length === 0) return 'TABLE';
  // A single number is a single number: a bar chart of one bar says less.
  if (columns.length === 1 && measures.length === 1) return 'NUMBER';
  if (measures.length >= 1 && dimensions.length === 1) {
    return isTemporal(dimensions[0]!) ? 'LINE' : 'BAR';
  }
  if (measures.length >= 2 && dimensions.length === 0) return 'SCATTER';
  // More than one dimension is a pivot, and the grid is the honest rendering
  // of a pivot until someone says otherwise.
  return 'TABLE';
}

/** Whether each shape can render this result, and why not when it cannot. */
export function visualizationFits(
  columns: readonly OutputColumn[],
): readonly VisualizationShapeFit[] {
  const measures = columns.filter(isMeasure).length;
  const dimensions = columns.filter(isDimension).length;
  // Before anything has run there is nothing to disqualify a shape with, so
  // every shape stays reachable rather than greying out the whole picker.
  const unknown = columns.length === 0;

  return visualizationOrder.map((type) => {
    if (unknown || type === 'TABLE') return { type, available: true };
    if (type === 'NUMBER') {
      return measures >= 1
        ? { type, available: true }
        : { type, available: false, reason: 'MEASURE' };
    }
    if (type === 'SCATTER') {
      return measures >= 2
        ? { type, available: true }
        : { type, available: false, reason: 'TWO_MEASURES' };
    }
    return measures >= 1 && dimensions >= 1
      ? { type, available: true }
      : { type, available: false, reason: 'CATEGORY' };
  });
}

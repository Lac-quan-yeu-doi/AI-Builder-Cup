import type { ChartEncodings } from '@domain/chart/models/chart';

export interface AssembleVegaLiteSpecInput {
  readonly chartType: string;
  readonly encodings: ChartEncodings;
  readonly data: readonly Record<string, unknown>[];
  readonly title: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

/**
 * Stable name for the chart's top-level dataset in the compiled Vega spec.
 * Exported so frontend renderers can target it via `view.change(name, ...)`
 * without guessing Vega-Lite's auto-generated dataset id.
 */
export const VEGA_LITE_DATASET_NAME = 'source';

/** Vega-Lite has no "scatter"/"pie" mark — those map onto "point"/"arc". */
const MARK_BY_CHART_TYPE: Readonly<Record<string, string>> = {
  bar: 'bar',
  line: 'line',
  area: 'area',
  point: 'point',
  scatter: 'point',
  pie: 'arc',
  arc: 'arc',
};

/**
 * Builds a Vega-Lite v5 spec from a chart's stored type/encodings/data.
 * Throws (caught by callers in `ChartUseCases`) when the chart type has no
 * mark mapping — the caller records this as the chart's `status: 'error'`
 * rather than surfacing it as an HTTP error, since the chart itself was
 * still created/updated successfully.
 */
export function assembleVegaLiteSpec(input: AssembleVegaLiteSpecInput): Record<string, unknown> {
  const mark = MARK_BY_CHART_TYPE[input.chartType];
  if (!mark) {
    throw new Error(`No Vega-Lite mark mapping for chart type "${input.chartType}"`);
  }

  const channels: readonly (keyof ChartEncodings)[] = [
    'x',
    'y',
    'color',
    'size',
    'shape',
    'tooltip',
    'facet',
  ];
  const encoding: Record<string, unknown> = {};
  for (const channel of channels) {
    const enc = input.encodings[channel];
    if (!enc) continue;
    encoding[channel] = {
      field: enc.field,
      type: enc.type,
      ...(enc.aggregate ? { aggregate: enc.aggregate } : {}),
      ...(enc.title ? { title: enc.title } : {}),
    };
  }

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: input.title,
    mark,
    // Naming the dataset makes Vega-Lite carry this exact name into the
    // compiled Vega spec's dataset id (rather than an auto-generated
    // "data_0"), so a renderer can target it directly via `view.change(name,
    // changeSet)` for in-place data updates instead of a full re-embed.
    data: { name: VEGA_LITE_DATASET_NAME, values: input.data },
    encoding,
    ...(input.config ? { config: input.config } : {}),
  };
}

import type { ChartDataRow, ChartEncodings, ChartType } from '@/src/entities/models/chart';
import type { ChartMark, ChartRow, ChartViewModel } from '@/src/entities/models/chart-renderer';

/**
 * Builds a view model from a chat chart's stored type and encodings.
 *
 * Core stores `chartType` + `encodings` + `data` and *derives* `vl_spec` from
 * them (`celesnity-core/src/application/chart/vega-lite-assembler.ts`). The
 * derived spec was what the chat sidebar used to render, which is why chat
 * charts could not follow the theme — a compiled Vega spec carries literal
 * colours and paints to `<canvas>`.
 *
 * Reading the semantic fields instead means no Core change: `vl_spec` is simply
 * no longer consumed here.
 */

const MARK_BY_CHART_TYPE: Readonly<Record<ChartType, ChartMark>> = {
  bar: 'BAR',
  line: 'LINE',
  area: 'AREA',
  point: 'SCATTER',
  scatter: 'SCATTER',
  pie: 'PIE',
  arc: 'PIE',
};

const CATEGORICAL = [
  'var(--mchart-1)',
  'var(--mchart-2)',
  'var(--mchart-3)',
  'var(--mchart-4)',
  'var(--mchart-5)',
  'var(--mchart-6)',
  'var(--mchart-7)',
] as const;

const OTHER = 'var(--mchart-8)';

export function chartEncodingsToView(
  chartType: ChartType,
  encodings: ChartEncodings,
  data: readonly ChartDataRow[],
): ChartViewModel | null {
  const mark = MARK_BY_CHART_TYPE[chartType];
  const xField = encodings.x?.field;
  const yField = encodings.y?.field;
  const colorField = encodings.color?.field;
  const sizeField = encodings.size?.field;
  if (!mark || !yField) return null;

  const rows = data.map(normalizeRow);

  if (mark === 'PIE') {
    // A pie's slice label is the colour channel when there is one, otherwise x.
    const categoryKey = colorField ?? xField;
    if (!categoryKey) return null;
    return {
      mark: 'PIE',
      rows,
      series: slots(rows.map((row) => String(row[categoryKey] ?? ''))),
      x: axis(categoryKey, encodings.x?.title),
      y: axis(yField, encodings.y?.title),
      categoryKey,
      showLegend: true,
      stacked: false,
      orientation: 'VERTICAL',
      markers: false,
      innerRadius: chartType === 'arc' ? 0.56 : 0,
    };
  }

  // A colour channel means one series per distinct value, which Recharts reads
  // from its own key — so the rows have to be pivoted from long to wide.
  const seriesKeys = colorField ? distinct(rows, colorField) : [yField];
  const shaped = colorField && xField ? pivot(rows, xField, colorField, yField) : rows;

  return {
    mark,
    rows: shaped,
    series: slots(seriesKeys),
    x: axis(xField, encodings.x?.title),
    y: axis(mark === 'SCATTER' ? yField : undefined, encodings.y?.title),
    showLegend: seriesKeys.length > 1,
    stacked: false,
    orientation: 'VERTICAL',
    markers: false,
    ...(mark === 'SCATTER' ? { opacity: 0.8, pointSize: 60, sizeKey: sizeField } : {}),
    ...(mark === 'AREA' ? { opacity: 0.7 } : {}),
  };
}

function slots(keys: readonly string[]) {
  return keys.map((key, index) => ({
    key,
    label: index >= CATEGORICAL.length ? 'Other' : key,
    color: index >= CATEGORICAL.length ? OTHER : (CATEGORICAL[index] ?? OTHER),
  }));
}

function axis(dataKey: string | undefined, title: string | undefined) {
  return { dataKey, title, visible: true, gridlines: true };
}

function distinct(rows: readonly ChartRow[], field: string): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined) seen.add(String(value));
  }
  return [...seen];
}

function pivot(
  rows: readonly ChartRow[],
  xField: string,
  seriesField: string,
  measureField: string,
): readonly ChartRow[] {
  const byX = new Map<string, ChartRow>();
  for (const row of rows) {
    const key = String(row[xField] ?? '');
    const existing = byX.get(key) ?? { [xField]: row[xField] ?? null };
    byX.set(key, { ...existing, [String(row[seriesField] ?? '')]: row[measureField] ?? null });
  }
  return [...byX.values()];
}

/** Core sends `Record<string, unknown>`; keep only what a chart can plot. */
function normalizeRow(row: ChartDataRow): ChartRow {
  const out: ChartRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : value === null || value === undefined
          ? null
          : String(value);
  }
  return out;
}

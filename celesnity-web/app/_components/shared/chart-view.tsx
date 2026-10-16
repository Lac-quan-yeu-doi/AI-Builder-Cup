'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import type { ChartAxisView, ChartViewModel } from '@/src/entities/models/chart-renderer';

/**
 * Draws a `ChartViewModel`.
 *
 * Every colour here is a `var(--...)` rather than a literal, which is the whole
 * point of the move off Vega: Vega rendered to `<canvas>` and could not read a
 * custom property, so charts sat permanently outside the token system. Recharts
 * renders DOM SVG, so grid, axis and mark colours follow the theme.
 */

const GRID = 'var(--mchart-grid)';
const AXIS = 'var(--mchart-axis)';
const MUTED = 'var(--mchart-muted)';
const SURFACE = 'var(--mchart-surface)';

const AXIS_TICK = { fill: MUTED, fontSize: 12 } as const;

/** Recharts takes a scale name; the domain is only meaningful once a bound is set. */
function scaleProps(axis: ChartAxisView) {
  const scale =
    axis.scale === 'LOG' ? ('log' as const) : axis.scale === 'POW' ? ('pow' as const) : undefined;
  const bounded = axis.min !== undefined || axis.max !== undefined;
  return {
    ...(scale ? { scale } : {}),
    ...(bounded ? { domain: [axis.min ?? 'auto', axis.max ?? 'auto'] as const } : {}),
  };
}

function axisLabel(axis: ChartAxisView) {
  return axis.title
    ? ({ value: axis.title, position: 'insideBottom' as const, offset: -4 } as const)
    : undefined;
}

const tooltipStyle = {
  contentStyle: {
    background: SURFACE,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--foreground)',
    fontSize: 12,
  },
  labelStyle: { color: MUTED },
} as const;

export interface ChartViewProps {
  readonly view: ChartViewModel;
  readonly height?: number;
  readonly ariaLabel?: string;
}

export function ChartView({ view, height = 320, ariaLabel }: ChartViewProps) {
  const { mark, rows, series, x, y, showLegend } = view;
  const grid = x.gridlines || y.gridlines;

  const common = (
    <>
      {grid ? <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={x.gridlines} /> : null}
      <XAxis
        dataKey={x.dataKey}
        hide={!x.visible}
        stroke={AXIS}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        label={axisLabel(x)}
        {...(mark === 'SCATTER' ? { type: 'number' as const, ...scaleProps(x) } : {})}
      />
      <YAxis
        hide={!y.visible}
        stroke={AXIS}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        {...(mark === 'SCATTER' ? { dataKey: y.dataKey, type: 'number' as const } : {})}
        {...scaleProps(y)}
      />
      <Tooltip cursor={{ fill: 'var(--accent)' }} {...tooltipStyle} />
      {showLegend ? <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} /> : null}
    </>
  );

  return (
    <div
      className="min-w-0 w-full"
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? `${mark.toLowerCase()} chart`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {mark === 'BAR' ? (
          <BarChart
            data={[...rows]}
            layout={view.orientation === 'HORIZONTAL' ? 'vertical' : 'horizontal'}
          >
            {view.orientation === 'HORIZONTAL' ? (
              <>
                {grid ? <CartesianGrid stroke={GRID} strokeDasharray="3 3" /> : null}
                <XAxis
                  type="number"
                  hide={!y.visible}
                  stroke={AXIS}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  {...scaleProps(y)}
                />
                <YAxis
                  type="category"
                  dataKey={x.dataKey}
                  hide={!x.visible}
                  stroke={AXIS}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <Tooltip cursor={{ fill: 'var(--accent)' }} {...tooltipStyle} />
                {showLegend ? <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} /> : null}
              </>
            ) : (
              common
            )}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={view.stacked ? 'stack' : undefined}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        ) : mark === 'LINE' ? (
          <LineChart data={[...rows]}>
            {common}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={view.markers ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : mark === 'AREA' ? (
          <AreaChart data={[...rows]}>
            {common}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={view.opacity ?? 0.7}
                strokeWidth={2}
                stackId={view.stacked ? 'stack' : undefined}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : mark === 'SCATTER' ? (
          <ScatterChart>
            {common}
            {view.sizeKey ? <ZAxis dataKey={view.sizeKey} range={[40, 400]} /> : null}
            {series.map((s) => (
              <Scatter
                key={s.key}
                data={[...rows]}
                name={s.label}
                fill={s.color}
                fillOpacity={view.opacity ?? 0.8}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        ) : (
          <PieChart>
            <Tooltip {...tooltipStyle} />
            {showLegend ? <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} /> : null}
            <Pie
              data={[...rows]}
              dataKey={y.dataKey ?? ''}
              nameKey={view.categoryKey ?? ''}
              innerRadius={view.innerRadius ? `${Math.round(view.innerRadius * 100)}%` : 0}
              outerRadius="80%"
              isAnimationActive={false}
              stroke={SURFACE}
            >
              {rows.map((row, index) => (
                <Cell
                  key={String(row[view.categoryKey ?? ''] ?? index)}
                  fill={series[index]?.color ?? 'var(--mchart-8)'}
                />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The six dashboards of Demo Data 1 (Home Appliance).
 *
 * Layout is computed, not hand-written. Cards are declared as rows, and the
 * builder assigns `x` across a row and `y` from the heights of the rows above —
 * so two cards cannot overlap and a row cannot exceed the 24-column grid without
 * `validateDashboards` saying so. Hand-placing 40 cards is how a demo ends up
 * with a chart sitting on top of another one at 1920×1080.
 *
 * Filter mappings are derived rather than declared: a filter reaches a card if,
 * and only if, that card's chart declares the matching parameter. Core validates
 * the *shape* of a mapping when a dashboard is saved but never checks that the
 * variable exists, so a hand-written mapping to a parameter a chart does not
 * have is a control that silently does nothing until someone clicks it on
 * camera.
 *
 */
import { createHash } from 'node:crypto';

import { CHARTS } from './charts.mjs';

const GRID = 24;
/** Deterministic UUIDs: every id column on a dashboard is `@db.Uuid`. */
export function demoUuid(name) {
  const digest = createHash('sha256').update(`demo1-home-appliance:${name}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `${((parseInt(digest[16], 16) & 0x3) | 0x8).toString(16)}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

/** The four filters, and the chart parameter each one drives. */
export const FILTERS = Object.freeze([
  {
    slug: 'from-date',
    label: 'From date',
    semanticType: 'DATE_PICKER',
    operator: 'SINGLE_DATE',
    variable: 'from_date',
  },
  {
    slug: 'to-date',
    label: 'To date',
    semanticType: 'DATE_PICKER',
    operator: 'SINGLE_DATE',
    variable: 'to_date',
  },
  {
    slug: 'line',
    label: 'Line',
    semanticType: 'TEXT_CATEGORY',
    operator: 'IS',
    variable: 'line',
  },
  {
    slug: 'shift',
    label: 'Shift',
    semanticType: 'TEXT_CATEGORY',
    operator: 'IS',
    variable: 'shift',
  },
]);

/*
 * Card heights are generous on purpose.
 *
 * A dashboard card is sized by its grid geometry and clips whatever does not
 * fit, so a chart with thirteen station names down its axis needs room the
 * default six rows do not give it — at that size the labels wrap into each
 * other and the plot itself gets cut off at the bottom.
 */
const heading = (text) => ({ kind: 'HEADING', text, w: GRID, h: 1 });
const kpi = (chart) => ({ kind: 'CHART', chart, w: 6, h: 4 });
const half = (chart, h = 11) => ({ kind: 'CHART', chart, w: 12, h });
const full = (chart, h = 9) => ({ kind: 'CHART', chart, w: GRID, h });
const third = (chart) => ({ kind: 'CHART', chart, w: 8, h: 4 });

export const DASHBOARDS = Object.freeze([
  {
    key: 'capacity-monitoring',
    name: 'Machine Capacity Monitoring',
    description:
      'Real-time machine capacity: output rate, percentage of design capacity, cycle time and the state of every machine position.',
    role: 'operations',
    isDefault: true,
    rows: [
      [heading('Machine capacity monitoring · Demo Data 1 – Home Appliance Plant (Chest Freezers)')],
      [
        kpi('kpi_cap_rate'),
        kpi('kpi_cap_utilization_pct'),
        kpi('kpi_cap_cycle_time'),
        kpi('kpi_cap_down_min'),
      ],
      [full('line_cap_rate_by_line', 10)],
      [half('line_cap_utilization_pct', 10), half('bar_cap_equipment_oee', 10)],
      [half('bar_cap_time_split', 12), half('table_cap_station_status', 12)],
    ],
  },
  {
    key: 'executive',
    name: 'Executive Dashboard – Leadership Team',
    description:
      'Output, quality, cost and delivery of the chest-freezer plant on one screen.',
    role: 'overview',
    isDefault: false,
    rows: [
      [heading('Demo Data 1 – Home Appliance Plant (Chest Freezers) · Design capacity 375,000 units/year')],
      [
        kpi('kpi_daily_output'),
        kpi('kpi_plan_attainment'),
        kpi('kpi_plant_oee'),
        kpi('kpi_fpy'),
      ],
      [
        kpi('kpi_downtime_hours'),
        kpi('kpi_kwh_per_unit'),
        kpi('kpi_fg_days_of_stock'),
        kpi('kpi_otd'),
      ],
      [
        { kind: 'CHART', chart: 'line_daily_output_by_line', w: 16, h: 9 },
        { kind: 'CHART', chart: 'pie_output_by_family', w: 8, h: 9 },
      ],
      [half('bar_oee_by_station'), half('bar_downtime_pareto')],
      [half('table_top_defects', 12), half('bar_export_by_market', 11)],
    ],
  },
  {
    key: 'operations',
    name: 'Operations & Lines',
    description: 'Daily output, the performance of each station and the causes of lost output.',
    role: 'operations',
    isDefault: false,
    rows: [
      [heading('Line operations · filter by line and shift in the bar above')],
      [full('line_daily_output_by_line')],
      [half('bar_oee_by_station'), half('bar_scrap_rework_by_station')],
      [half('bar_downtime_pareto'), half('bar_output_by_model')],
      [full('table_work_orders', 11)],
    ],
  },
  {
    key: 'quality',
    name: 'Quality & Alerts',
    description: 'Yield, the main defect codes and the R600a gas-leak trend by model.',
    role: 'quality',
    isDefault: false,
    rows: [
      [heading('Product quality · last 30 days')],
      [third('kpi_fpy'), third('kpi_plant_oee'), third('kpi_downtime_hours')],
      [full('line_r600a_leaks')],
      [half('table_top_defects', 12), half('bar_scrap_rework_by_station', 12)],
      [half('pie_downtime_by_category', 10), half('bar_output_by_model', 10)],
    ],
  },
  {
    key: 'equipment',
    name: 'Equipment & Maintenance',
    description: 'Performance by station and by machine, with sensor readings sent over MQTT.',
    role: 'maintenance',
    isDefault: false,
    rows: [
      [heading('Equipment & maintenance · OEE by machine and sensor signals')],
      [half('bar_oee_by_station'), half('table_equipment_oee')],
      [full('line_equipment_sensors')],
      [half('bar_downtime_pareto'), half('pie_downtime_by_category')],
    ],
  },
  {
    key: 'energy-export',
    name: 'Energy & Export',
    description: 'Energy per unit, how it tracks temperature, and the goods leaving through the export port.',
    role: 'custom',
    isDefault: false,
    rows: [
      [heading('Energy & export · shipments through the port')],
      [third('kpi_kwh_per_unit'), third('kpi_otd'), third('kpi_fg_days_of_stock')],
      [half('scatter_kwh_vs_temperature'), half('bar_export_by_market')],
      [full('table_export_shipments', 11)],
    ],
  },
]);

/**
 * Turns a dashboard spec into the tabs/cards/filters/mappings Core stores.
 *
 * `scope` seeds every generated id and should be the dashboard's own id.
 * Deleting a dashboard archives it rather than removing the row, so ids derived
 * from the spec key collide with the tabs and cards of a board that was renamed
 * or replaced — Core answers that with a bare 500 from a unique-constraint
 * violation, which is a long way from the cause.
 *
 * `availableCharts` maps a chart key to its saved id. A chart that was not
 * created — the sensor trend, until the MQTT stream exists — is dropped along
 * with its row, rather than leaving a card pointing at nothing.
 */
export function buildDashboard(spec, availableCharts, scope = spec.key) {
  const tabId = demoUuid(`${scope}:tab`);
  const cards = [];
  const mappings = [];
  const chartsByKey = new Map(CHARTS.map((chart) => [chart.key, chart]));
  const skipped = [];
  let y = 0;

  for (const row of spec.rows) {
    const present = row.filter((item) => item.kind !== 'CHART' || availableCharts.has(item.chart));
    for (const item of row) {
      if (item.kind === 'CHART' && !availableCharts.has(item.chart)) skipped.push(item.chart);
    }
    if (present.length === 0) continue;

    let x = 0;
    for (const item of present) {
      const cardId = demoUuid(`${scope}:card:${item.chart ?? item.kind}:${x}:${y}`);
      const geometry = { x, y, width: item.w, height: item.h };
      if (item.kind === 'CHART') {
        cards.push({
          id: cardId,
          tab_id: tabId,
          kind: 'CHART',
          chart_id: availableCharts.get(item.chart),
          chart_revision_number: null,
          visualization_overrides: {},
          geometry,
        });
        const chart = chartsByKey.get(item.chart);
        for (const filter of FILTERS) {
          if (!chart.parameters.some((parameter) => parameter.name === filter.variable)) continue;
          mappings.push({
            filter_id: demoUuid(`${scope}:filter:${filter.slug}`),
            card_id: cardId,
            target: { kind: 'NATIVE_QUERY_VARIABLE', variable_key: filter.variable },
          });
        }
      } else {
        cards.push({
          id: cardId,
          tab_id: tabId,
          kind: item.kind,
          content: item.kind === 'HEADING' ? { text: item.text } : { markdown: item.markdown },
          geometry,
        });
      }
      x += item.w;
    }
    y += Math.max(...present.map((item) => item.h));
  }

  /* A filter with nothing to drive is a control that does nothing. */
  const usedFilters = new Set(mappings.map((mapping) => mapping.filter_id));
  const filters = FILTERS.map((filter, order) => ({
    id: demoUuid(`${scope}:filter:${filter.slug}`),
    slug: filter.slug,
    label: filter.label,
    semantic_type: filter.semanticType,
    operator: filter.operator,
    default_value: null,
    required: false,
    multiple: false,
    values_source: null,
    placement: { kind: 'TOP_OF_PAGE' },
    order,
  })).filter((filter) => usedFilters.has(filter.id));

  return {
    tabs: [{ id: tabId, name: 'Overview', order: 0 }],
    cards,
    filters,
    mappings,
    skipped,
  };
}

/** Everything about a dashboard that can be checked before it is saved. */
export function validateDashboards(dashboards = DASHBOARDS, chartKeys = undefined) {
  const problems = [];
  const known = chartKeys ?? new Set(CHARTS.map((chart) => chart.key));
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

  for (const filter of FILTERS) {
    if (!slugPattern.test(filter.slug))
      problems.push(`filter ${filter.slug}: slug is not URL-safe`);
  }
  if (dashboards.filter((item) => item.isDefault).length !== 1) {
    problems.push('exactly one dashboard must be the default for the plant site');
  }

  for (const spec of dashboards) {
    for (const [index, row] of spec.rows.entries()) {
      const width = row.reduce((sum, item) => sum + item.w, 0);
      if (width > GRID) problems.push(`${spec.key} row ${index}: ${width} columns exceeds ${GRID}`);
      for (const item of row) {
        if (item.kind === 'CHART' && !known.has(item.chart)) {
          problems.push(`${spec.key}: card references unknown chart "${item.chart}"`);
        }
      }
    }

    const built = buildDashboard(spec, new Map([...known].map((key) => [key, demoUuid(key)])));
    const occupied = new Map();
    for (const card of built.cards) {
      const { x, y, width, height } = card.geometry;
      if (x < 0 || x + width > GRID) problems.push(`${spec.key}: a card falls outside the grid`);
      for (let row = y; row < y + height; row += 1) {
        for (let column = x; column < x + width; column += 1) {
          const cell = `${row}:${column}`;
          if (occupied.has(cell)) problems.push(`${spec.key}: cards overlap at ${cell}`);
          occupied.set(cell, card.id);
        }
      }
    }
    if (new Set(built.cards.map((card) => card.id)).size !== built.cards.length) {
      problems.push(`${spec.key}: duplicate card ids`);
    }
  }
  return [...new Set(problems)];
}

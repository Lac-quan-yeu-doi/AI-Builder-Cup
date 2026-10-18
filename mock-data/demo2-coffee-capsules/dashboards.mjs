/**
 * The six dashboards of Demo Data 2 (coffee capsules) — layout computed, filter
 * mappings derived from each chart's own parameters (see the Demo Data 1 pack for
 * why both matter). Every board carries the "mock data" notice.
 */
import { createHash } from 'node:crypto';

import { CHARTS } from './charts.mjs';

const GRID = 24;
export function demoUuid(name) {
  const digest = createHash('sha256').update(`demo2-coffee-capsules:${name}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `${((parseInt(digest[16], 16) & 0x3) | 0x8).toString(16)}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

export const FILTERS = Object.freeze([
  { slug: 'from-date', label: 'From date', semanticType: 'DATE_PICKER', operator: 'SINGLE_DATE', variable: 'from_date' },
  { slug: 'to-date', label: 'To date', semanticType: 'DATE_PICKER', operator: 'SINGLE_DATE', variable: 'to_date' },
  { slug: 'line', label: 'Line (CAP_L1 / CAP_L2)', semanticType: 'TEXT_CATEGORY', operator: 'IS', variable: 'line' },
  { slug: 'shift', label: 'Shift (SHIFT_1 / SHIFT_2 / SHIFT_3)', semanticType: 'TEXT_CATEGORY', operator: 'IS', variable: 'shift' },
]);

const NOTICE = 'Mock data for the demo — not real figures from any plant. How each number is calculated: see the chart descriptions.';
const heading = (text) => ({ kind: 'HEADING', text, w: GRID, h: 1 });
const notice = () => ({ kind: 'TEXT', markdown: NOTICE, w: GRID, h: 2 });
const kpi = (chart) => ({ kind: 'CHART', chart, w: 6, h: 4 });
const kpi8 = (chart) => ({ kind: 'CHART', chart, w: 8, h: 4 });
const half = (chart, h = 10) => ({ kind: 'CHART', chart, w: 12, h });
const full = (chart, h = 10) => ({ kind: 'CHART', chart, w: GRID, h });

export const DASHBOARDS = Object.freeze([
  {
    key: 'overview',
    name: 'Overview – Site Manager',
    description: 'Output, OEE, material loss, humidity risk and the equipment needing attention on the capsule lines, on one screen.',
    role: 'overview',
    isDefault: true,
    rows: [
      [heading('Demo Data 2 · Coffee capsule lines · filling & packing')],
      [kpi('kpi_daily_output'), kpi('kpi_oee_l1'), kpi('kpi_oee_l2'), kpi('kpi_material_yield')],
      [kpi('kpi_loss_cost_vnd'), kpi('kpi_humidity_risk'), kpi('kpi_assets_needing_attention'), kpi('kpi_stock_cover')],
      [{ kind: 'CHART', chart: 'line_daily_output', w: 14, h: 10 }, { kind: 'CHART', chart: 'table_alerts', w: 10, h: 10 }],
      [half('bar_time_loss'), half('bar_material_balance')],
      [notice()],
    ],
  },
  {
    key: 'material-loss',
    name: 'Material loss',
    description: 'Coffee powder balance from machine data (hopper load cells, checkweighers, purges) against the manual shift log.',
    role: 'quality',
    isDefault: false,
    rows: [
      [heading('Material loss · machine data instead of the handwritten log')],
      [kpi8('kpi_overfill_21d'), kpi8('kpi_loss_cost_vnd'), kpi8('kpi_material_yield')],
      [full('line_fill_weight')],
      [half('bar_material_balance'), half('bar_manual_vs_machine')],
      [half('bar_log_blank_rate', 9), half('bar_changeover_purge', 9)],
      [full('table_top_loss_shifts', 11)],
      [notice()],
    ],
  },
  {
    key: 'line-operations',
    name: 'Line operations',
    description: 'Hourly output, OEE, stop causes, recipe changeovers and process orders.',
    role: 'operations',
    isDefault: false,
    rows: [
      [heading('Line operations · filter by line, shift and date range in the bar above')],
      [full('line_hourly_output', 9)],
      [half('line_daily_oee'), half('bar_stop_pareto')],
      [half('line_weekly_changeovers'), half('line_minor_stops_l1')],
      [full('table_process_orders', 11)],
      [notice()],
    ],
  },
  {
    key: 'demand-forecast',
    name: 'Demand forecast & production plan',
    description: 'Weekly rolling forecast per SKU × market against the 6-month plan; Q4 capacity load and stock cover.',
    role: 'custom',
    isDefault: false,
    rows: [
      [heading('Demand forecast · refreshed every Monday 03:00 by an automatic data workflow')],
      [full('line_demand_plan_forecast', 11)],
      [half('bar_forecast_error', 9), half('line_ph_th_actual_vs_plan', 9)],
      [half('line_forecast_13w'), half('bar_capacity_load')],
      [full('bar_stock_cover_by_sku', 9)],
      [notice()],
    ],
  },
  {
    key: 'weekly-schedule',
    name: 'Weekly production schedule',
    description: 'Next week’s schedule built automatically by Minder (Thursday 14:00) against the hand-made schedules: changeovers, purge, planning hours.',
    role: 'custom',
    isDefault: false,
    rows: [
      [heading('Weekly production schedule · built by Minder, approved by the Site Manager')],
      [full('table_minder_schedule', 13)],
      [half('bar_manual_vs_minder_changeovers', 9), half('bar_planned_purge', 9)],
      [half('bar_planning_hours', 9), half('line_plan_adherence', 9)],
      [notice()],
    ],
  },
  {
    key: 'environment-equipment',
    name: 'Room environment & equipment',
    description: 'Filling-room humidity, the 7-day risk forecast, asset health and remaining useful life from current / vibration sensors.',
    role: 'maintenance',
    isDefault: false,
    rows: [
      [heading('Filling-room environment & predictive maintenance')],
      [half('line_humidity_risk'), half('line_room_humidity')],
      [half('line_ahu_wheel_current'), half('line_humidity_incident')],
      [full('table_asset_health', 11)],
      [half('line_auger_vibration'), half('line_seal_heater_lookback')],
      [notice()],
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

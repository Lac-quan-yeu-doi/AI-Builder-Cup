/**
 * The 33 charts of Demo Data 1 (Home Appliance), as data.
 *
 * Every chart is Trino SQL against `iceberg.demo1_home_appliance` plus a
 * canonical visualization definition. Two conventions here are load-bearing:
 *
 *  1. **Every parameter is optional and wrapped in `[[ ... ]]`.** Core's
 *     renderer throws on a required parameter with no value and refuses a bare
 *     optional one, so a chart with required filters cannot be opened on its own
 *     page — only from a dashboard that supplies them. Optional blocks let the
 *     same chart stand alone *and* narrow when a dashboard filter fires.
 *  2. **Windows anchor to the data, not to the wall clock.** The generator's
 *     last day is D-1, so `current_date` would leave "today" empty whenever
 *     the seed is a day stale. Everything measures back from the latest
 *     production timestamp instead, which is immune to that.
 *
 * `visualization.roles` field names must appear in `outputSchema` — that
 * mismatch is the usual cause of a card that renders blank, and
 * `03-seed-charts.mjs` asserts it before anything is created.
 */
import { OEE_ROLLUP_SQL } from './curated-schema.mjs';
import { DOWNTIME_REASONS, WORK_CENTERS } from './reference.mjs';

const T = (table) => `iceberg.demo1_home_appliance.${table}`;
/** The most recent production day in the warehouse. */
const LATEST = `(SELECT date_trunc('day', max(ts)) FROM ${T('fact_production_hourly')})`;

const DATE_PARAMS = [
  { name: 'from_date', type: 'DATE', required: false },
  { name: 'to_date', type: 'DATE', required: false },
];
const LINE_PARAM = { name: 'line', type: 'STRING', required: false };
const SHIFT_PARAM = { name: 'shift', type: 'STRING', required: false };
const ALL_PARAMS = [...DATE_PARAMS, LINE_PARAM, SHIFT_PARAM];

/** Optional narrowing applied on top of a chart's own base window. */
const dateFilter = (column) => `
  [[ AND ${column} >= {{from_date}} ]]
  [[ AND ${column} < {{to_date}} + interval '1' day ]]`;
const lineFilter = `
  [[ AND line_code = {{line}} ]]`;
const shiftFilter = `
  [[ AND shift = {{shift}} ]]`;

/**
 * A short, hand-written axis label for a station or a downtime reason.
 *
 * Emitted as a CASE map rather than joined from the dimension, so the axis can
 * be made readable without rebuilding a curated table — and it reads from
 * `reference.mjs`, so the short names cannot drift from the codes the rest of
 * the demo uses.
 */
const shortLabelCase = (column, entries, codeKey, shortKey) =>
  `CASE ${entries
    .map((entry) => `WHEN ${column} = '${entry[codeKey]}' THEN '${entry[shortKey]}'`)
    .join(' ')} ELSE ${column} END`;

const stationLabel = (column) =>
  shortLabelCase(column, WORK_CENTERS, 'workcenter_code', 'short_name');
const reasonLabel = (column) =>
  shortLabelCase(column, DOWNTIME_REASONS, 'reason_code', 'short_name');

const col = (name, type, family) => ({ name, type, family });
const NUM = (name) => col(name, 'double', 'NUMBER');
const INT = (name) => col(name, 'bigint', 'NUMBER');
const STR = (name) => col(name, 'varchar', 'STRING');
const DAY = (name) => col(name, 'date', 'DATE');

/**
 * A KPI card: current value plus the previous period, for the delta.
 *
 * `decimalPlaces` and `suffix` are repeated at the top of `display` as well as
 * inside `valueFormatting`. The NUMBER renderer reads the top-level pair, and
 * with only the nested one set a percentage arrives on screen as
 * `71.4753243744207600` — Trino returns `decimal(38,16)` and nothing rounds it.
 */
const kpiCard = (measure, comparison, formatting) => ({
  schemaVersion: 1,
  type: 'NUMBER',
  roles: { measure },
  display: {
    showTitle: true,
    showValue: true,
    comparison: { type: 'PERCENT_CHANGE', field: comparison, label: 'prior period' },
    comparisonStyle: 'DELTA',
    valueFormatting: formatting,
    decimalPlaces: formatting.decimalPlaces,
    ...(formatting.suffix === undefined ? {} : { suffix: formatting.suffix }),
    ...(formatting.compact === undefined ? {} : { compact: formatting.compact }),
  },
});

export const CHARTS = [
  // ── Executive KPI cards ────────────────────────────────────────────────────
  {
    key: 'kpi_daily_output',
    title: 'Output, latest day',
    description: 'Freezers received into the finished-goods warehouse on the latest production day, against the day before.',
    parameters: [],
    sql: `
SELECT
  sum(CASE WHEN date_trunc('day', ts) = ${LATEST} THEN good_qty ELSE 0 END) AS output,
  sum(CASE WHEN date_trunc('day', ts) = ${LATEST} - interval '1' day THEN good_qty ELSE 0 END) AS prior_period
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '2' day`,
    outputSchema: [INT('output'), INT('prior_period')],
    visualization: kpiCard('output', 'prior_period', { style: 'NUMBER', decimalPlaces: 0 }),
  },
  {
    key: 'kpi_plan_attainment',
    title: 'Plan attainment %',
    description: 'Actual output against the takt-based plan, last 30 days.',
    parameters: [],
    sql: `
SELECT
  100.0 * sum(CASE WHEN ts >= ${LATEST} - interval '29' day THEN good_qty ELSE 0 END)
        / nullif(sum(CASE WHEN ts >= ${LATEST} - interval '29' day THEN planned_qty ELSE 0 END), 0) AS attainment,
  100.0 * sum(CASE WHEN ts < ${LATEST} - interval '29' day THEN good_qty ELSE 0 END)
        / nullif(sum(CASE WHEN ts < ${LATEST} - interval '29' day THEN planned_qty ELSE 0 END), 0) AS prior_period
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '59' day`,
    outputSchema: [NUM('attainment'), NUM('prior_period')],
    visualization: kpiCard('attainment', 'prior_period', { style: 'NUMBER', decimalPlaces: 1, suffix: '%' }),
  },
  {
    key: 'kpi_plant_oee',
    title: 'Plant-wide OEE',
    description: 'Weighted-average OEE over the last 30 days, against the 30 days before.',
    parameters: [],
    sql: `
WITH recent AS (
  SELECT * FROM ${T('fact_oee_shift')}
   WHERE shift_date >= CAST(${LATEST} AS date) - interval '29' day
), prior AS (
  SELECT * FROM ${T('fact_oee_shift')}
   WHERE shift_date >= CAST(${LATEST} AS date) - interval '59' day
     AND shift_date <  CAST(${LATEST} AS date) - interval '29' day
)
SELECT
  (SELECT 100.0 * ${OEE_ROLLUP_SQL} FROM recent) AS oee,
  (SELECT 100.0 * ${OEE_ROLLUP_SQL} FROM prior)  AS prior_period`,
    outputSchema: [NUM('oee'), NUM('prior_period')],
    visualization: kpiCard('oee', 'prior_period', { style: 'NUMBER', decimalPlaces: 1, suffix: '%' }),
  },
  {
    key: 'kpi_fpy',
    title: 'First-pass yield (FPY)',
    description:
      'Freezers received into the warehouse over all freezers that entered the line, counting scrap and rework, last 30 days.',
    parameters: [],
    sql: `
WITH w AS (
  SELECT * FROM ${T('fact_production_hourly')}
   WHERE ts >= ${LATEST} - interval '59' day
), recent AS (SELECT * FROM w WHERE ts >= ${LATEST} - interval '29' day),
   prior AS (SELECT * FROM w WHERE ts <  ${LATEST} - interval '29' day)
SELECT
  100.0 * (SELECT sum(good_qty) FROM recent WHERE workcenter_code = 'FG_WH')
        / nullif((SELECT sum(good_qty) FROM recent WHERE workcenter_code = 'FG_WH')
               + (SELECT sum(scrap_qty + rework_qty) FROM recent), 0) AS fpy,
  100.0 * (SELECT sum(good_qty) FROM prior WHERE workcenter_code = 'FG_WH')
        / nullif((SELECT sum(good_qty) FROM prior WHERE workcenter_code = 'FG_WH')
               + (SELECT sum(scrap_qty + rework_qty) FROM prior), 0) AS prior_period`,
    outputSchema: [NUM('fpy'), NUM('prior_period')],
    visualization: kpiCard('fpy', 'prior_period', { style: 'NUMBER', decimalPlaces: 2, suffix: '%' }),
  },
  {
    key: 'kpi_downtime_hours',
    title: 'Machine downtime (hours)',
    description: 'Total recorded machine downtime, last 30 days.',
    parameters: [],
    sql: `
SELECT
  sum(CASE WHEN start_ts >= ${LATEST} - interval '29' day THEN duration_min ELSE 0 END) / 60.0 AS downtime_hours,
  sum(CASE WHEN start_ts <  ${LATEST} - interval '29' day THEN duration_min ELSE 0 END) / 60.0 AS prior_period
FROM ${T('fact_downtime_event')}
WHERE start_ts >= ${LATEST} - interval '59' day`,
    outputSchema: [NUM('downtime_hours'), NUM('prior_period')],
    visualization: kpiCard('downtime_hours', 'prior_period', { style: 'NUMBER', decimalPlaces: 0 }),
  },
  {
    key: 'kpi_kwh_per_unit',
    title: 'Energy per unit (kWh)',
    description: 'Plant-wide kWh divided by freezers received into the warehouse, last 30 days.',
    parameters: [],
    sql: `
WITH e AS (
  SELECT sum(CASE WHEN ts >= ${LATEST} - interval '29' day THEN kwh ELSE 0 END) AS recent,
         sum(CASE WHEN ts <  ${LATEST} - interval '29' day THEN kwh ELSE 0 END) AS prior
    FROM ${T('fact_energy_hourly')} WHERE ts >= ${LATEST} - interval '59' day
), p AS (
  SELECT sum(CASE WHEN ts >= ${LATEST} - interval '29' day THEN good_qty ELSE 0 END) AS recent,
         sum(CASE WHEN ts <  ${LATEST} - interval '29' day THEN good_qty ELSE 0 END) AS prior
    FROM ${T('fact_production_hourly')}
   WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '59' day
)
SELECT CAST(e.recent AS double) / nullif(p.recent, 0) AS kwh_per_unit,
       CAST(e.prior  AS double) / nullif(p.prior, 0)  AS prior_period
FROM e CROSS JOIN p`,
    outputSchema: [NUM('kwh_per_unit'), NUM('prior_period')],
    visualization: kpiCard('kwh_per_unit', 'prior_period', { style: 'NUMBER', decimalPlaces: 1 }),
  },
  {
    key: 'kpi_fg_days_of_stock',
    title: 'Finished-goods stock (days of sales)',
    description: 'Closing stock divided by average daily shipments over the last 30 days.',
    parameters: [],
    sql: `
WITH latest_day AS (SELECT max(snapshot_date) AS d FROM ${T('fact_inventory_fg')}),
stock AS (
  SELECT sum(closing_qty) AS qty FROM ${T('fact_inventory_fg')}
   WHERE snapshot_date = (SELECT d FROM latest_day)
),
stock_prior AS (
  SELECT sum(closing_qty) AS qty FROM ${T('fact_inventory_fg')}
   WHERE snapshot_date = (SELECT d FROM latest_day) - interval '30' day
),
shipped AS (
  SELECT sum(issued_qty) / 30.0 AS per_day FROM ${T('fact_inventory_fg')}
   WHERE snapshot_date > (SELECT d FROM latest_day) - interval '30' day
)
SELECT stock.qty / nullif(shipped.per_day, 0) AS days_of_sales,
       stock_prior.qty / nullif(shipped.per_day, 0) AS prior_period
FROM stock CROSS JOIN stock_prior CROSS JOIN shipped`,
    outputSchema: [NUM('days_of_sales'), NUM('prior_period')],
    visualization: kpiCard('days_of_sales', 'prior_period', { style: 'NUMBER', decimalPlaces: 1 }),
  },
  {
    key: 'kpi_otd',
    title: 'On-time delivery (OTD)',
    description: 'Share of export containers delivered on or before the committed date, last 30 days.',
    parameters: [],
    sql: `
WITH s AS (
  SELECT ship_date, CASE WHEN delivered_date <= committed_date THEN 1 ELSE 0 END AS on_time
    FROM ${T('fact_shipment_export')}
   WHERE ship_date >= CAST(${LATEST} AS date) - interval '59' day
)
SELECT
  100.0 * sum(CASE WHEN ship_date >= CAST(${LATEST} AS date) - interval '29' day THEN on_time ELSE 0 END)
        / nullif(sum(CASE WHEN ship_date >= CAST(${LATEST} AS date) - interval '29' day THEN 1 ELSE 0 END), 0) AS otd,
  100.0 * sum(CASE WHEN ship_date <  CAST(${LATEST} AS date) - interval '29' day THEN on_time ELSE 0 END)
        / nullif(sum(CASE WHEN ship_date <  CAST(${LATEST} AS date) - interval '29' day THEN 1 ELSE 0 END), 0) AS prior_period
FROM s`,
    outputSchema: [NUM('otd'), NUM('prior_period')],
    visualization: kpiCard('otd', 'prior_period', { style: 'NUMBER', decimalPlaces: 1, suffix: '%' }),
  },
  // ── Trends ─────────────────────────────────────────────────────────────────
  {
    key: 'line_daily_output_by_line',
    title: '30-day output by line',
    description: 'Freezers received into the warehouse each day, split by line.',
    parameters: ALL_PARAMS,
    sql: `
SELECT CAST(date_trunc('day', p.ts) AS date) AS day,
       l.line_name                           AS line,
       sum(p.good_qty)                       AS output
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_line')} l ON l.line_code = p.line_code
WHERE p.workcenter_code = 'FG_WH'
  AND p.ts >= ${LATEST} - interval '29' day${dateFilter('p.ts')}
  [[ AND p.line_code = {{line}} ]]
  [[ AND p.shift = {{shift}} ]]
GROUP BY 1, 2
ORDER BY 1`,
    outputSchema: [DAY('day'), STR('line'), INT('output')],
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'day', measures: ['output'], series: 'line' },
      display: { showLegend: true, markers: false, interpolation: 'SMOOTH', gridlines: true },
    },
  },
  {
    key: 'line_oee_foam',
    title: 'PU foam station OEE trend',
    description:
      'Daily OEE of the PU foam station on the steel-lid chest freezer line — where output is being lost.',
    parameters: DATE_PARAMS,
    sql: `
SELECT shift_date AS day, 100.0 * ${OEE_ROLLUP_SQL} AS oee
FROM ${T('fact_oee_shift')}
WHERE line_code = 'LINE_FRZ_1' AND workcenter_code = 'PU_FOAM'
  AND shift_date >= CAST(${LATEST} AS date) - interval '59' day${dateFilter('shift_date')}
GROUP BY shift_date
ORDER BY shift_date`,
    outputSchema: [DAY('day'), NUM('oee')],
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'day', measures: ['oee'] },
      display: {
        showLegend: false,
        markers: true,
        interpolation: 'LINEAR',
        axes: { y: { title: 'OEE (%)', min: 0, max: 100 } },
        valueFormatting: { style: 'NUMBER', decimalPlaces: 1, suffix: '%' },
      },
    },
  },
  {
    key: 'line_r600a_leaks',
    title: 'R600a gas leaks by day',
    description: 'Freezers caught leaking gas at the leak test station, split by model.',
    parameters: DATE_PARAMS,
    sql: `
SELECT CAST(date_trunc('day', ts) AS date) AS day,
       product_model                       AS model,
       sum(qty)                            AS quantity
FROM ${T('fact_quality_defect')}
WHERE defect_code = 'QC_R600A_LEAK'
  AND ts >= ${LATEST} - interval '44' day${dateFilter('ts')}
GROUP BY 1, 2
ORDER BY 1`,
    outputSchema: [DAY('day'), STR('model'), INT('quantity')],
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'day', measures: ['quantity'], series: 'model' },
      display: { showLegend: true, markers: false, interpolation: 'LINEAR' },
    },
  },
  {
    key: 'line_equipment_sensors',
    title: 'Equipment temperature & vibration by hour',
    description: 'Readings sent from sensors mounted on the equipment, over the MQTT stream.',
    requires: 'fact_sensor_reading',
    parameters: [],
    sql: `
SELECT date_trunc('hour', ts)                       AS reading_hour,
       concat(equipment_code, ' · ', metric)        AS signal,
       avg(value)                                   AS value
FROM ${T('fact_sensor_reading')}
WHERE ts >= (SELECT max(ts) FROM ${T('fact_sensor_reading')}) - interval '48' hour
  AND metric IN ('temperature', 'vibration')
GROUP BY 1, 2
ORDER BY 1`,
    outputSchema: [col('reading_hour', 'timestamp', 'TIMESTAMP'), STR('signal'), NUM('value')],
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'reading_hour', measures: ['value'], series: 'signal' },
      display: { showLegend: true, markers: false, interpolation: 'SMOOTH' },
    },
  },

  // ── Comparisons ────────────────────────────────────────────────────────────
  {
    key: 'bar_oee_by_station',
    title: 'OEE by station',
    description: '30-day OEE of each station, in route order.',
    parameters: ALL_PARAMS,
    sql: `
SELECT ${stationLabel('o.workcenter_code')} AS station,
       100.0 * ${OEE_ROLLUP_SQL} AS oee,
       sum(o.downtime_min)  AS downtime_min,
       sum(o.starved_min)   AS starved_min
FROM ${T('fact_oee_shift')} o
JOIN ${T('dim_workcenter')} w ON w.workcenter_code = o.workcenter_code
WHERE o.shift_date >= CAST(${LATEST} AS date) - interval '29' day${dateFilter('o.shift_date')}
  [[ AND o.line_code = {{line}} ]]
  [[ AND o.shift = {{shift}} ]]
GROUP BY ${stationLabel('o.workcenter_code')}, w.sequence
ORDER BY w.sequence`,
    outputSchema: [STR('station'), NUM('oee'), INT('downtime_min'), INT('starved_min')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'station', measures: ['oee'] },
      display: {
        orientation: 'HORIZONTAL',
        stacking: 'NONE',
        showLegend: false,
        showLabels: true,
        valueFormatting: { style: 'NUMBER', decimalPlaces: 1, suffix: '%' },
      },
    },
  },
  {
    key: 'bar_downtime_pareto',
    title: 'Downtime reason Pareto',
    description:
      'Total downtime minutes by reason, last 14 days — a window short enough for the problem happening now to rise to the top.',
    parameters: [...DATE_PARAMS, LINE_PARAM],
    sql: `
SELECT ${reasonLabel('d.reason_code')} AS reason,
       r.category          AS category,
       sum(d.duration_min) AS minutes
FROM ${T('fact_downtime_event')} d
JOIN ${T('dim_downtime_reason')} r ON r.reason_code = d.reason_code
WHERE d.start_ts >= ${LATEST} - interval '13' day${dateFilter('d.start_ts')}
  [[ AND d.line_code = {{line}} ]]
GROUP BY 1, 2
ORDER BY minutes DESC
LIMIT 10`,
    outputSchema: [STR('reason'), STR('category'), INT('minutes')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'reason', measures: ['minutes'] },
      display: { orientation: 'HORIZONTAL', showLegend: false, showLabels: true },
    },
  },
  {
    key: 'bar_output_by_model',
    title: 'Output by model',
    description: 'Freezers received into the warehouse by model code, last 30 days.',
    parameters: ALL_PARAMS,
    sql: `
SELECT m.product_model AS model,
       m.product_name  AS product_name,
       sum(p.good_qty) AS output
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_product_model')} m ON m.product_model = p.product_model
WHERE p.workcenter_code = 'FG_WH'
  AND p.ts >= ${LATEST} - interval '29' day${dateFilter('p.ts')}
  [[ AND p.line_code = {{line}} ]]
  [[ AND p.shift = {{shift}} ]]
GROUP BY 1, 2
ORDER BY output DESC`,
    outputSchema: [STR('model'), STR('product_name'), INT('output')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'model', measures: ['output'] },
      display: { orientation: 'VERTICAL', showLegend: false, showLabels: true },
    },
  },
  {
    key: 'bar_export_by_market',
    title: 'Export volume by market',
    description: 'Freezers exported and on-time delivery rate by market, last 90 days.',
    parameters: DATE_PARAMS,
    sql: `
SELECT destination_market AS market,
       sum(qty)           AS quantity,
       100.0 * sum(CASE WHEN delivered_date <= committed_date THEN 1 ELSE 0 END)
             / nullif(count(*), 0) AS otd
FROM ${T('fact_shipment_export')}
WHERE ship_date >= CAST(${LATEST} AS date) - interval '89' day${dateFilter('ship_date')}
GROUP BY 1
ORDER BY quantity DESC`,
    outputSchema: [STR('market'), INT('quantity'), NUM('otd')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'market', measures: ['quantity'] },
      display: { orientation: 'VERTICAL', showLegend: false, showLabels: true },
    },
  },
  {
    key: 'bar_scrap_rework_by_station',
    title: 'Scrap and rework by station',
    description: 'Freezers scrapped or sent back for rework at each station, last 30 days.',
    parameters: ALL_PARAMS,
    sql: `
SELECT ${stationLabel('p.workcenter_code')} AS station,
       sum(p.scrap_qty)  AS scrap,
       sum(p.rework_qty) AS rework
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_workcenter')} w ON w.workcenter_code = p.workcenter_code
WHERE p.ts >= ${LATEST} - interval '29' day${dateFilter('p.ts')}
  [[ AND p.line_code = {{line}} ]]
  [[ AND p.shift = {{shift}} ]]
GROUP BY ${stationLabel('p.workcenter_code')}, w.sequence
ORDER BY w.sequence`,
    outputSchema: [STR('station'), INT('scrap'), INT('rework')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'station', measures: ['scrap', 'rework'] },
      display: { orientation: 'HORIZONTAL', stacking: 'STACKED', showLegend: true },
    },
  },

  // ── Proportions ────────────────────────────────────────────────────────────
  {
    key: 'pie_downtime_by_category',
    title: 'Downtime by reason category',
    description: 'Share of machine downtime by category, last 30 days.',
    parameters: DATE_PARAMS,
    sql: `
SELECT r.category AS category, sum(d.duration_min) AS minutes
FROM ${T('fact_downtime_event')} d
JOIN ${T('dim_downtime_reason')} r ON r.reason_code = d.reason_code
WHERE d.start_ts >= ${LATEST} - interval '29' day${dateFilter('d.start_ts')}
GROUP BY 1
ORDER BY minutes DESC`,
    outputSchema: [STR('category'), INT('minutes')],
    visualization: {
      schemaVersion: 1,
      type: 'PIE',
      roles: { measure: 'minutes', breakout: 'category' },
      display: {
        variant: 'DONUT',
        showLegend: true,
        showTotal: true,
        percentagePlacement: 'IN_LEGEND',
      },
    },
  },
  {
    key: 'pie_output_by_family',
    title: 'Output by product family',
    description: 'Share of output between steel-lid, glass-top and mini chest freezers, last 30 days.',
    parameters: DATE_PARAMS,
    sql: `
SELECT m.product_family AS product_family, sum(p.good_qty) AS output
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_product_model')} m ON m.product_model = p.product_model
WHERE p.workcenter_code = 'FG_WH'
  AND p.ts >= ${LATEST} - interval '29' day${dateFilter('p.ts')}
GROUP BY 1
ORDER BY output DESC`,
    outputSchema: [STR('product_family'), INT('output')],
    visualization: {
      schemaVersion: 1,
      type: 'PIE',
      roles: { measure: 'output', breakout: 'product_family' },
      display: { variant: 'DONUT', showLegend: true, showTotal: true, percentagePlacement: 'BOTH' },
    },
  },

  // ── Correlation ────────────────────────────────────────────────────────────
  {
    key: 'scatter_kwh_vs_temperature',
    title: 'Energy per unit vs ambient temperature',
    description:
      'Each point is one production day. As the temperature rises, chiller load and foam cure time rise with it.',
    parameters: DATE_PARAMS,
    sql: `
WITH e AS (
  SELECT CAST(date_trunc('day', ts) AS date) AS day,
         sum(kwh) AS kwh, avg(ambient_c) AS temperature
    FROM ${T('fact_energy_hourly')}
   WHERE ts >= ${LATEST} - interval '89' day${dateFilter('ts')}
   GROUP BY 1
), p AS (
  SELECT CAST(date_trunc('day', ts) AS date) AS day, sum(good_qty) AS output
    FROM ${T('fact_production_hourly')}
   WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '89' day
   GROUP BY 1
)
SELECT e.day,
       CAST(e.temperature AS double)         AS temperature,
       CAST(e.kwh AS double) / p.output      AS kwh_per_unit
FROM e JOIN p ON p.day = e.day
WHERE p.output > 0
ORDER BY e.day`,
    outputSchema: [DAY('day'), NUM('temperature'), NUM('kwh_per_unit')],
    visualization: {
      schemaVersion: 1,
      type: 'SCATTER',
      roles: { x: 'temperature', y: 'kwh_per_unit' },
      display: {
        showLegend: false,
        pointSize: 60,
        axes: { x: { title: 'Ambient temperature (°C)' }, y: { title: 'kWh / unit' } },
      },
    },
  },

  // ── Machine capacity monitoring ────────────────────────────────────────────
  //
  // A capacity board answers three questions and no others: what rate are we
  // running at, how much of the machines' design capacity is that, and which
  // station is holding the line back. Everything here is per hour of machine
  // time so the live layer has a grid to walk along.
  {
    key: 'kpi_cap_rate',
    title: 'Production rate (units/hour)',
    description: 'Freezers leaving the line in the latest machine hour.',
    parameters: [],
    sql: `
WITH h AS (SELECT max(ts) AS latest_hour FROM ${T('fact_production_hourly')})
SELECT
  sum(CASE WHEN ts = (SELECT latest_hour FROM h) THEN good_qty ELSE 0 END) AS rate,
  sum(CASE WHEN ts = (SELECT latest_hour FROM h) - interval '1' hour THEN good_qty ELSE 0 END) AS prior_hour
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '1' day`,
    outputSchema: [INT('rate'), INT('prior_hour')],
    visualization: kpiCard('rate', 'prior_hour', { style: 'NUMBER', decimalPlaces: 0 }),
  },
  {
    key: 'kpi_cap_utilization_pct',
    title: '% of design capacity',
    description: 'Current rate against the design capacity of the three lines (78 units/hour).',
    parameters: [],
    sql: `
WITH h AS (SELECT max(ts) AS latest_hour FROM ${T('fact_production_hourly')}),
design AS (SELECT sum(daily_capacity) / 16.0 AS per_hour FROM ${T('dim_line')})
SELECT
  100.0 * sum(CASE WHEN ts = (SELECT latest_hour FROM h) THEN good_qty ELSE 0 END)
        / (SELECT per_hour FROM design) AS pct,
  100.0 * sum(CASE WHEN ts = (SELECT latest_hour FROM h) - interval '1' hour THEN good_qty ELSE 0 END)
        / (SELECT per_hour FROM design) AS prior_hour
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '1' day`,
    outputSchema: [NUM('pct'), NUM('prior_hour')],
    visualization: kpiCard('pct', 'prior_hour', {
      style: 'NUMBER',
      decimalPlaces: 1,
      suffix: '%',
    }),
  },
  {
    key: 'kpi_cap_cycle_time',
    title: 'Actual cycle time (sec/unit)',
    description: 'Average time for one freezer to leave the line in the latest machine hour.',
    parameters: [],
    sql: `
WITH h AS (SELECT max(ts) AS latest_hour FROM ${T('fact_production_hourly')})
SELECT
  3600.0 / nullif(sum(CASE WHEN ts = (SELECT latest_hour FROM h) THEN good_qty ELSE 0 END), 0) AS cycle_time,
  3600.0 / nullif(sum(CASE WHEN ts = (SELECT latest_hour FROM h) - interval '1' hour THEN good_qty ELSE 0 END), 0) AS prior_hour
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts >= ${LATEST} - interval '1' day`,
    outputSchema: [NUM('cycle_time'), NUM('prior_hour')],
    visualization: kpiCard('cycle_time', 'prior_hour', { style: 'NUMBER', decimalPlaces: 1 }),
  },
  {
    key: 'kpi_cap_down_min',
    title: 'Machine downtime this hour (min)',
    description: 'Downtime minutes summed across every machine position in the latest hour.',
    parameters: [],
    sql: `
WITH h AS (SELECT max(ts) AS latest_hour FROM ${T('fact_production_hourly')})
SELECT
  sum(CASE WHEN ts = (SELECT latest_hour FROM h) THEN downtime_min ELSE 0 END) AS downtime_min,
  sum(CASE WHEN ts = (SELECT latest_hour FROM h) - interval '1' hour THEN downtime_min ELSE 0 END) AS prior_hour
FROM ${T('fact_production_hourly')}
WHERE ts >= ${LATEST} - interval '1' day`,
    outputSchema: [INT('downtime_min'), INT('prior_hour')],
    visualization: kpiCard('downtime_min', 'prior_hour', { style: 'NUMBER', decimalPlaces: 0 }),
  },
  {
    key: 'line_cap_rate_by_line',
    title: 'Production rate by line (units/hour)',
    description: 'Output rate of each line.',
    parameters: [],
    sql: `
SELECT p.ts AS hour_start, l.line_name AS line, sum(p.good_qty) AS rate
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_line')} l ON l.line_code = p.line_code
WHERE p.workcenter_code = 'FG_WH' AND p.ts > ${LATEST} - interval '1' day
GROUP BY p.ts, l.line_name
ORDER BY p.ts`,
    outputSchema: [col('hour_start', 'timestamp', 'TIMESTAMP'), STR('line'), INT('rate')],
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'hour_start', measures: ['rate'], series: 'line' },
      display: { showLegend: true, markers: false, interpolation: 'SMOOTH', gridlines: true },
    },
  },
  {
    key: 'line_cap_utilization_pct',
    title: 'Plant-wide capacity utilization %',
    description: 'Share of design capacity in use, over time.',
    parameters: [],
    sql: `
WITH design AS (SELECT sum(daily_capacity) / 16.0 AS per_hour FROM ${T('dim_line')})
SELECT ts AS hour_start,
       100.0 * sum(good_qty) / (SELECT per_hour FROM design) AS pct
FROM ${T('fact_production_hourly')}
WHERE workcenter_code = 'FG_WH' AND ts > ${LATEST} - interval '1' day
GROUP BY ts
ORDER BY ts`,
    outputSchema: [col('hour_start', 'timestamp', 'TIMESTAMP'), NUM('pct')],
    visualization: {
      schemaVersion: 1,
      type: 'AREA',
      roles: { x: 'hour_start', measures: ['pct'] },
      display: {
        showLegend: false,
        stacking: 'NONE',
        gridlines: true,
        axes: { y: { title: '% of capacity', min: 0, max: 120 } },
      },
    },
  },
  {
    key: 'bar_cap_time_split',
    title: 'Machine time split by station',
    description: 'Where each station spends its time: running, stopped, or waiting for material.',
    parameters: [],
    sql: `
SELECT ${stationLabel('p.workcenter_code')} AS station,
       sum(p.runtime_min)     AS running,
       sum(p.downtime_min)    AS stopped,
       sum(p.starved_min)     AS starved
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_workcenter')} w ON w.workcenter_code = p.workcenter_code
WHERE p.ts > ${LATEST} - interval '1' day
GROUP BY ${stationLabel('p.workcenter_code')}, w.sequence
ORDER BY w.sequence`,
    outputSchema: [STR('station'), INT('running'), INT('stopped'), INT('starved')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'station', measures: ['running', 'stopped', 'starved'] },
      display: { orientation: 'HORIZONTAL', stacking: 'STACKED', showLegend: true },
    },
  },
  {
    key: 'bar_cap_equipment_oee',
    title: 'Equipment capacity (OEE %)',
    description: 'Performance of each machine — the same table the Plant Model node cards read.',
    parameters: [],
    sql: `
SELECT equipment_code AS equipment, 100.0 * oee AS oee
FROM ${T('dm_equipment_oee')}
ORDER BY oee`,
    outputSchema: [STR('equipment'), NUM('oee')],
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'equipment', measures: ['oee'] },
      display: {
        orientation: 'HORIZONTAL',
        showLegend: false,
        showLabels: true,
        valueFormatting: { style: 'NUMBER', decimalPlaces: 0, suffix: '%' },
      },
    },
  },
  {
    key: 'table_cap_station_status',
    title: 'Station status',
    description: 'Rate, cycle time and lost time of each machine position in the latest hour.',
    parameters: [],
    sql: `
WITH h AS (SELECT max(ts) AS latest_hour FROM ${T('fact_production_hourly')})
SELECT ${stationLabel('p.workcenter_code')} AS station,
       sum(p.good_qty)                                        AS rate,
       round(3600.0 / nullif(sum(p.good_qty), 0), 1)           AS cycle_time,
       sum(p.downtime_min)                                     AS downtime_min,
       sum(p.starved_min)                                      AS starved_min
FROM ${T('fact_production_hourly')} p
JOIN ${T('dim_workcenter')} w ON w.workcenter_code = p.workcenter_code
WHERE p.ts = (SELECT latest_hour FROM h)
GROUP BY ${stationLabel('p.workcenter_code')}, w.sequence
ORDER BY w.sequence`,
    outputSchema: [
      STR('station'),
      INT('rate'),
      NUM('cycle_time'),
      INT('downtime_min'),
      INT('starved_min'),
    ],
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: { columns: ['station', 'rate', 'cycle_time', 'downtime_min', 'starved_min'] },
      display: { rowDensity: 'COMPACT', pageSize: 13 },
    },
  },

  // ── Tables ─────────────────────────────────────────────────────────────────
  {
    key: 'table_top_defects',
    title: 'Top 10 defect codes, 30 days',
    description: 'The most frequent defect codes, with the station that caught them and their severity.',
    parameters: [...DATE_PARAMS, LINE_PARAM],
    sql: `
SELECT d.defect_name      AS defect_name,
       w.workcenter_name  AS station,
       d.severity         AS severity,
       sum(q.qty)         AS quantity
FROM ${T('fact_quality_defect')} q
JOIN ${T('dim_defect_code')} d ON d.defect_code = q.defect_code
JOIN ${T('dim_workcenter')} w ON w.workcenter_code = q.workcenter_code
WHERE q.ts >= ${LATEST} - interval '29' day${dateFilter('q.ts')}
  [[ AND q.line_code = {{line}} ]]
GROUP BY 1, 2, 3
ORDER BY quantity DESC
LIMIT 10`,
    outputSchema: [STR('defect_name'), STR('station'), STR('severity'), INT('quantity')],
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: { columns: ['defect_name', 'station', 'severity', 'quantity'] },
      display: { rowDensity: 'COMPACT', showRowIndex: true, pageSize: 10 },
    },
  },
  {
    key: 'table_work_orders',
    title: 'Latest work orders',
    description: 'The newest work orders and how far each has progressed against plan.',
    parameters: [LINE_PARAM],
    sql: `
SELECT o.work_order            AS work_order,
       m.product_name          AS product,
       l.line_name             AS line,
       o.start_date            AS start_date,
       o.planned_qty           AS planned,
       o.completed_qty         AS completed,
       o.status                AS status
FROM ${T('fact_work_order')} o
JOIN ${T('dim_product_model')} m ON m.product_model = o.product_model
JOIN ${T('dim_line')} l ON l.line_code = o.line_code
WHERE 1 = 1
  [[ AND o.line_code = {{line}} ]]
ORDER BY o.start_date DESC
LIMIT 20`,
    outputSchema: [
      STR('work_order'),
      STR('product'),
      STR('line'),
      DAY('start_date'),
      INT('planned'),
      INT('completed'),
      STR('status'),
    ],
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: {
        columns: [
          'work_order',
          'product',
          'line',
          'start_date',
          'planned',
          'completed',
          'status',
        ],
      },
      display: { rowDensity: 'COMPACT', enableSearch: true, pageSize: 10 },
    },
  },
  {
    key: 'table_equipment_oee',
    title: 'OEE by equipment',
    description:
      'Latest OEE of each machine — the same table the live property on the Plant Model node cards reads.',
    parameters: [],
    sql: `
SELECT equipment_code AS equipment, oee, label AS display
FROM ${T('dm_equipment_oee')}
ORDER BY oee`,
    outputSchema: [STR('equipment'), NUM('oee'), STR('display')],
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: { columns: ['equipment', 'oee', 'display'] },
      display: {
        rowDensity: 'COMPACT',
        columnFormatting: { oee: { style: 'PERCENT', decimalPlaces: 1 } },
        pageSize: 12,
      },
    },
  },
  {
    key: 'table_export_shipments',
    title: 'Export shipments',
    description: 'The latest containers to leave port, with committed and actual delivery dates.',
    parameters: DATE_PARAMS,
    sql: `
SELECT ship_date          AS ship_date,
       container_no       AS container_no,
       destination_market AS market,
       port               AS port,
       product_model      AS model,
       qty                AS quantity,
       committed_date     AS committed_date,
       delivered_date     AS delivered_date
FROM ${T('fact_shipment_export')}
WHERE ship_date >= CAST(${LATEST} AS date) - interval '29' day${dateFilter('ship_date')}
ORDER BY ship_date DESC
LIMIT 25`,
    outputSchema: [
      DAY('ship_date'),
      STR('container_no'),
      STR('market'),
      STR('port'),
      STR('model'),
      INT('quantity'),
      DAY('committed_date'),
      DAY('delivered_date'),
    ],
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: {
        columns: [
          'ship_date',
          'container_no',
          'market',
          'port',
          'model',
          'quantity',
          'committed_date',
          'delivered_date',
        ],
      },
      display: { rowDensity: 'COMPACT', enableSearch: true, pageSize: 10 },
    },
  },
];

/** Field names a visualization binds, by type. Order does not matter. */
function boundFields(visualization) {
  const { type, roles, display } = visualization;
  const fields = [];
  if (type === 'NUMBER') {
    fields.push(roles.measure);
    if (display?.comparison?.field) fields.push(display.comparison.field);
  } else if (type === 'TABLE') {
    fields.push(...roles.columns);
    fields.push(...Object.keys(display?.columnFormatting ?? {}));
  } else if (type === 'PIE') {
    fields.push(roles.measure, roles.breakout);
  } else if (type === 'SCATTER') {
    fields.push(roles.x, roles.y, roles.series, roles.size);
  } else {
    fields.push(roles.x ?? roles.category, ...(roles.measures ?? []), roles.series, roles.breakout);
  }
  return fields.filter((field) => typeof field === 'string');
}

/**
 * Everything about a chart that can be checked without a warehouse.
 *
 * The three failures this catches are the ones that produce a blank card rather
 * than an error: a visualization bound to a column the query does not return, a
 * table name that does not exist in the curated contract, and a parameter
 * placeholder outside an optional block — which Core rejects at render time, on
 * camera, rather than at seed time.
 */
export function validateCharts(charts = CHARTS, knownTables = undefined) {
  const problems = [];
  for (const chart of charts) {
    const schema = new Set(chart.outputSchema.map((column) => column.name));
    for (const field of boundFields(chart.visualization)) {
      if (!schema.has(field)) {
        problems.push(
          `${chart.key}: visualization binds "${field}", which the query does not return`,
        );
      }
    }

    const declared = new Set(chart.parameters.map((parameter) => parameter.name));
    const used = new Set(
      [...chart.sql.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu)].map((match) => match[1]),
    );
    for (const name of used) {
      if (!declared.has(name)) problems.push(`${chart.key}: uses undeclared parameter {{${name}}}`);
    }
    for (const name of declared) {
      if (!used.has(name)) problems.push(`${chart.key}: declares unused parameter ${name}`);
    }

    const outsideBlocks = chart.sql.replace(/\[\[[\s\S]*?\]\]/gu, '');
    const stray = [...outsideBlocks.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu)];
    for (const match of stray) {
      problems.push(
        `${chart.key}: {{${match[1]}}} sits outside [[...]]; every parameter here is optional and Core refuses that`,
      );
    }

    if (knownTables !== undefined) {
      for (const match of chart.sql.matchAll(/iceberg\.demo1_home_appliance\.([a-z_]+)/gu)) {
        if (!knownTables.has(match[1])) {
          problems.push(`${chart.key}: reads ${match[1]}, which is not a curated table`);
        }
      }
    }

    if (chart.outputSchema.length === 0) problems.push(`${chart.key}: declares no output columns`);
  }

  /*
   * Titles are the seed script's key for finding an existing chart, so two
   * charts sharing one silently collapse into a single row — the card then
   * renders whichever definition was written last, which is how a bar chart
   * ended up drawing a table.
   */
  const byTitle = new Map();
  for (const chart of charts) {
    const clash = byTitle.get(chart.title);
    if (clash !== undefined) problems.push(`${chart.key}: shares the title of ${clash}`);
    byTitle.set(chart.title, chart.key);
  }
  return problems;
}

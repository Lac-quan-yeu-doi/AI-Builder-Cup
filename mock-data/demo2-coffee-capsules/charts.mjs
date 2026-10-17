/**
 * Charts of Demo Data 2 (coffee capsules), as data: Trino SQL against
 * `iceberg.demo2_coffee_capsules` plus a canonical visualization.
 *
 * Conventions carried over from Demo Data 1 (all load-bearing):
 *  - every parameter is optional and lives inside `[[ … ]]`;
 *  - windows anchor to the latest data (`max(ts)`), never to `current_date`;
 *  - OEE, material loss, forecast, health and risk are READ from the derived
 *    tables — no chart re-derives them with its own formula.
 */
import { CURATED_DATABASE, LINE_OEE_STATION, OEE_ROLLUP_SQL } from './curated-schema.mjs';
import { FAULT_CODES, SKUS } from './reference.mjs';

const T = (table) => `iceberg.${CURATED_DATABASE}.${table}`;
const LATEST = `(SELECT max(ts) FROM ${T('fact_production_hourly')})`;
const LATEST_DAY = `(SELECT date_trunc('day', max(ts)) FROM ${T('fact_production_hourly')})`;
const LATEST_DATE = `(SELECT CAST(max(ts) AS date) FROM ${T('fact_production_hourly')})`;

const DATE_PARAMS = [
  { name: 'from_date', type: 'DATE', required: false },
  { name: 'to_date', type: 'DATE', required: false },
];
const LINE_PARAM = { name: 'line', type: 'STRING', required: false };
const SHIFT_PARAM = { name: 'shift', type: 'STRING', required: false };
const dateFilter = (column) => `
  [[ AND ${column} >= {{from_date}} ]]
  [[ AND ${column} < {{to_date}} + interval '1' day ]]`;
const lineFilter = (column = 'line_code') => `
  [[ AND ${column} = {{line}} ]]`;
const shiftFilter = (column = 'shift_code') => `
  [[ AND ${column} = {{shift}} ]]`;

const skuName = (column) => `CASE ${column} ${SKUS.map((s) => `WHEN ${Number(s.sku)} THEN '${s.ten.replace(' capsule', '')}'`).join(' ')} END`;
const faultName = (column) => `CASE ${column} ${FAULT_CODES.map((f) => `WHEN '${f.code}' THEN '${f.ngan}'`).join(' ')} ELSE ${column} END`;

const col = (name, type, family) => ({ name, type, family });
const NUM = (name) => col(name, 'double', 'NUMBER');
const INT = (name) => col(name, 'bigint', 'NUMBER');
const STR = (name) => col(name, 'varchar', 'STRING');
const DAY = (name) => col(name, 'date', 'DATE');
const TS = (name) => col(name, 'timestamp', 'TIMESTAMP');

const kpi = (measure, comparison, formatting, label = 'previous period') => ({
  schemaVersion: 1,
  type: 'NUMBER',
  roles: { measure },
  display: {
    showTitle: true,
    showValue: true,
    ...(comparison ? { comparison: { type: 'PERCENT_CHANGE', field: comparison, label }, comparisonStyle: 'DELTA' } : {}),
    valueFormatting: formatting,
    decimalPlaces: formatting.decimalPlaces,
    ...(formatting.suffix === undefined ? {} : { suffix: formatting.suffix }),
    ...(formatting.compact === undefined ? {} : { compact: formatting.compact }),
  },
});
const line = (x, measures, series, display = {}) => ({
  schemaVersion: 1,
  type: 'LINE',
  roles: { x, measures, ...(series ? { series } : {}) },
  display: { showLegend: Boolean(series) || measures.length > 1, markers: false, interpolation: 'LINEAR', gridlines: true, ...display },
});
const bar = (category, measures, series, display = {}) => ({
  schemaVersion: 1,
  type: 'BAR',
  roles: { category, measures, ...(series ? { breakout: series } : {}) },
  display: { orientation: 'VERTICAL', stacking: 'NONE', showLegend: Boolean(series) || measures.length > 1, showLabels: false, ...display },
});
const table = (columns, display = {}) => ({
  schemaVersion: 1,
  type: 'TABLE',
  roles: { columns },
  display: { rowDensity: 'COMPACT', enableSearch: false, pageSize: 12, ...display },
});
const pct = { style: 'NUMBER', decimalPlaces: 1, suffix: '%' };

/* OEE of a line over a date window, read at the capsule inspection station. */
const oeeWindow = (lineCode, fromDays, toDays) => `
  (SELECT 100.0 * ${OEE_ROLLUP_SQL} FROM ${T('fact_oee_shift')}
    WHERE line_code = '${lineCode}' AND workcenter_code LIKE '%${LINE_OEE_STATION}'
      AND shift_date > ${LATEST_DATE} - interval '${fromDays}' day AND shift_date <= ${LATEST_DATE} - interval '${toDays}' day)`;

/*
 * Core wraps every native chart as `SELECT * FROM (<sql>) AS chart_query LIMIT 10000`,
 * and Trino drops an inner ORDER BY that has no LIMIT — a join or union then
 * arrives in arbitrary order and a date axis renders scrambled. `ordered()`
 * gives every trailing ORDER BY its own LIMIT, which Trino must honour.
 */
const ordered = (chart) => {
  const sql = chart.sql.replace(/\s+$/u, '');
  const tail = sql.slice(sql.lastIndexOf('ORDER BY'));
  return sql.includes('ORDER BY') && !/\bLIMIT\s+\d+\s*$/u.test(tail) ? { ...chart, sql: `${sql}\nLIMIT 10000` } : chart;
};

const RAW_CHARTS = [
  /* ── Overview – Site Manager ──────────────────────────────────────────── */
  {
    key: 'kpi_daily_output',
    title: 'Output on the latest production day (boxes)',
    description: 'Good 16-capsule boxes at the box checkweigher, both lines, latest production day versus the production day before (Sundays / holidays skipped).',
    parameters: [],
    sql: `
WITH d AS (
  SELECT date_trunc('day', ts) AS day, sum(good_qty) AS boxes
  FROM ${T('fact_production_hourly')}
  WHERE workcenter_code LIKE '%BOX_CHECK' AND ts >= ${LATEST_DAY} - interval '10' day
  GROUP BY 1 HAVING sum(good_qty) > 1000
)
SELECT max_by(boxes, day) AS output, (SELECT max_by(boxes, day) FROM d WHERE day < (SELECT max(day) FROM d)) AS previous FROM d`,
    outputSchema: [INT('output'), INT('previous')],
    visualization: kpi('output', 'previous', { style: 'NUMBER', decimalPlaces: 0, compact: true }),
  },
  {
    key: 'kpi_oee_l1',
    title: 'Line 1 OEE (30 days)',
    description: 'OEE = availability × performance × quality, measured at the capsule checkweigher. Compared with the 30 days before.',
    parameters: [],
    sql: `SELECT ${oeeWindow('CAP_L1', 30, 0)} AS oee, ${oeeWindow('CAP_L1', 60, 30)} AS previous`,
    outputSchema: [NUM('oee'), NUM('previous')],
    visualization: kpi('oee', 'previous', pct),
  },
  {
    key: 'kpi_oee_l2',
    title: 'Line 2 OEE (30 days)',
    description: 'OEE of the expansion line, measured at the capsule checkweigher. Compared with the 30 days before.',
    parameters: [],
    sql: `SELECT ${oeeWindow('CAP_L2', 30, 0)} AS oee, ${oeeWindow('CAP_L2', 60, 30)} AS previous`,
    outputSchema: [NUM('oee'), NUM('previous')],
    visualization: kpi('oee', 'previous', pct),
  },
  {
    key: 'kpi_material_yield',
    title: 'Material yield (30 days)',
    description: 'Target powder mass in good capsules divided by all powder fed into the hoppers (load cells). 100% = no loss.',
    parameters: [],
    sql: `
SELECT 100.0 * sum(CASE WHEN shift_date > ${LATEST_DATE} - interval '30' day THEN theoretical_kg END)
             / sum(CASE WHEN shift_date > ${LATEST_DATE} - interval '30' day THEN powder_in_kg END) AS yield_pct,
       100.0 * sum(CASE WHEN shift_date <= ${LATEST_DATE} - interval '30' day THEN theoretical_kg END)
             / sum(CASE WHEN shift_date <= ${LATEST_DATE} - interval '30' day THEN powder_in_kg END) AS previous
FROM ${T('fact_material_balance_shift')}
WHERE shift_date > ${LATEST_DATE} - interval '60' day`,
    outputSchema: [NUM('yield_pct'), NUM('previous')],
    visualization: kpi('yield_pct', 'previous', { style: 'NUMBER', decimalPlaces: 2, suffix: '%' }),
  },
  {
    key: 'kpi_loss_cost_vnd',
    title: 'Powder loss cost, 7 days (million VND)',
    description: 'Powder fed in that did not end up as on-target good capsules (overfill, rejects, purges, unexplained loss), priced at the reference cost.',
    parameters: [],
    sql: `
SELECT sum(CASE WHEN shift_date > ${LATEST_DATE} - interval '7' day THEN loss_vnd END) / 1e6 AS vnd_million,
       sum(CASE WHEN shift_date <= ${LATEST_DATE} - interval '7' day THEN loss_vnd END) / 1e6 AS previous
FROM ${T('fact_material_balance_shift')}
WHERE shift_date > ${LATEST_DATE} - interval '14' day`,
    outputSchema: [NUM('vnd_million'), NUM('previous')],
    visualization: kpi('vnd_million', 'previous', { style: 'NUMBER', decimalPlaces: 0 }),
  },
  {
    key: 'kpi_humidity_risk',
    title: 'Highest humidity risk, next 7 days (score)',
    description: 'Filling-room risk score 0–100: forecast outdoor dew point, AHU desiccant-wheel current and the room humidity trend. ≥ 65 = HIGH.',
    parameters: [],
    sql: `
SELECT 100 * max(CASE WHEN is_forecast THEN risk END) AS score,
       100 * max(CASE WHEN NOT is_forecast AND ts > (SELECT max(ts) FROM ${T('fact_room_risk')} WHERE NOT is_forecast) - interval '7' day THEN risk END) AS previous
FROM ${T('fact_room_risk')}`,
    outputSchema: [NUM('score'), NUM('previous')],
    visualization: kpi('score', 'previous', { style: 'NUMBER', decimalPlaces: 0 }, 'last 7 days'),
  },
  {
    key: 'kpi_assets_needing_attention',
    title: 'Assets needing attention',
    description: 'Assets with a health index below 50 (Warning / Critical) now, compared with 7 days ago.',
    parameters: [],
    sql: `
WITH now_ AS (SELECT max(ts) AS t FROM ${T('fact_asset_health')})
SELECT count(DISTINCT CASE WHEN ts = (SELECT t FROM now_) AND health < 50 THEN asset_code END) AS assets,
       count(DISTINCT CASE WHEN ts = (SELECT t FROM now_) - interval '7' day AND health < 50 THEN asset_code END) AS previous
FROM ${T('fact_asset_health')}
WHERE ts IN ((SELECT t FROM now_), (SELECT t FROM now_) - interval '7' day)`,
    outputSchema: [INT('assets'), INT('previous')],
    visualization: kpi('assets', 'previous', { style: 'NUMBER', decimalPlaces: 0 }, '7 days ago'),
  },
  {
    key: 'kpi_stock_cover',
    title: 'Finished-goods stock cover (days)',
    description: 'Finished-goods stock divided by average shipments per working day over the last 4 weeks.',
    parameters: [],
    sql: `
WITH d AS (SELECT max(stock_date) AS d FROM ${T('fact_fg_stock_daily')}),
ship AS (SELECT sum(shipped_boxes) / 24.0 AS per_day FROM ${T('fact_shipment_weekly')}
          WHERE week_start > (SELECT max(week_start) FROM ${T('fact_shipment_weekly')}) - interval '28' day)
SELECT (SELECT sum(stock_boxes) FROM ${T('fact_fg_stock_daily')} WHERE stock_date = (SELECT d FROM d)) / (SELECT per_day FROM ship) AS days,
       (SELECT sum(stock_boxes) FROM ${T('fact_fg_stock_daily')} WHERE stock_date = (SELECT d FROM d) - interval '14' day) / (SELECT per_day FROM ship) AS previous`,
    outputSchema: [NUM('days'), NUM('previous')],
    visualization: kpi('days', 'previous', { style: 'NUMBER', decimalPlaces: 1 }, '2 weeks ago'),
  },
  {
    key: 'line_daily_output',
    title: 'Daily output by line (boxes)',
    description: 'Good boxes per day, last 30 days.',
    parameters: [...DATE_PARAMS, LINE_PARAM],
    sql: `
SELECT CAST(date_trunc('day', ts) AS date) AS day, line_code AS line, sum(good_qty) AS boxes
FROM ${T('fact_production_hourly')}
WHERE workcenter_code LIKE '%BOX_CHECK' AND ts > ${LATEST_DAY} - interval '30' day${dateFilter('ts')}${lineFilter()}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [DAY('day'), STR('line'), INT('boxes')],
    visualization: line('day', ['boxes'], 'line'),
  },
  {
    key: 'bar_time_loss',
    title: 'Time lost by cause category (hours, 30 days)',
    description: 'Total stop time by category: breakdowns, minor stops, changeovers, environment, material, quality. Sunday CIP cleaning excluded.',
    parameters: [...DATE_PARAMS, LINE_PARAM],
    sql: `
SELECT s.line_code AS line, f.category, sum(s.duration_s) / 3600.0 AS hours
FROM ${T('fact_stop_event')} s JOIN ${T('dim_fault_code')} f ON f.fault_code = s.fault_code
WHERE s.start_ts > ${LATEST_DAY} - interval '30' day AND s.fault_code <> 'P020'${dateFilter('s.start_ts')}${lineFilter('s.line_code')}
GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
    outputSchema: [STR('line'), STR('category'), NUM('hours')],
    visualization: bar('line', ['hours'], 'category', { stacking: 'STACKED', orientation: 'HORIZONTAL' }),
  },
  {
    key: 'table_alerts',
    title: 'Alerts to act on',
    description: 'Assets with health below 75 and filling rooms with humidity risk in the next 7 days, read straight from the prediction tables.',
    parameters: [],
    sql: `
SELECT 'Equipment' AS type, a.asset_name AS item, h.label AS status, h.health AS score
FROM ${T('dm_asset_health')} h JOIN ${T('dim_asset')} a ON a.asset_code = h.asset_code
WHERE h.health < 75
UNION ALL
SELECT 'Room', r.room_name, e.label, 100 * (SELECT max(risk) FROM ${T('fact_room_risk')} k WHERE k.room_code = e.room_code AND k.is_forecast)
FROM ${T('dm_room_env')} e JOIN ${T('dim_room')} r ON r.room_code = e.room_code
ORDER BY 4`,
    outputSchema: [STR('type'), STR('item'), STR('status'), NUM('score')],
    visualization: table(['type', 'item', 'status']),
  },

  /* ── Material loss (UC1) ──────────────────────────────────────────────── */
  {
    key: 'kpi_overfill_21d',
    title: 'Total powder overfill on line 1 – 21 days (kg)',
    description: 'Powder inside good capsules above the target mass (including the normal ~0.12 g/capsule overfill). The checkweigher does not reject it and nobody logs it — only machine data shows it.',
    parameters: [],
    sql: `
SELECT sum(CASE WHEN shift_date > ${LATEST_DATE} - interval '21' day THEN giveaway_kg END) AS kg,
       sum(CASE WHEN shift_date <= ${LATEST_DATE} - interval '21' day THEN giveaway_kg END) AS previous
FROM ${T('fact_material_balance_shift')}
WHERE line_code = 'CAP_L1' AND shift_date > ${LATEST_DATE} - interval '42' day`,
    outputSchema: [NUM('kg'), NUM('previous')],
    visualization: kpi('kg', 'previous', { style: 'NUMBER', decimalPlaces: 0 }, 'previous 21 days'),
  },
  {
    key: 'bar_material_balance',
    title: 'Weekly material balance (kg powder lost)',
    description: 'Loss split by source: overfill, rejected capsules, changeover purges, and the unexplained remainder (spillage, scale drift).',
    parameters: [LINE_PARAM],
    sql: `
WITH w AS (
  SELECT date_trunc('week', shift_date) AS week, sum(giveaway_kg) AS overfill, sum(reject_kg) AS rejects, sum(purge_kg) AS purge, sum(unexplained_kg) AS other
  FROM ${T('fact_material_balance_shift')}
  WHERE shift_date > ${LATEST_DATE} - interval '84' day${lineFilter()}
  GROUP BY 1
)
SELECT CAST(week AS date) AS week, source, kg FROM w
CROSS JOIN UNNEST(ARRAY['Overfill', 'Rejected capsules', 'Changeover purge', 'Other'], ARRAY[overfill, rejects, purge, other]) AS t(source, kg)
ORDER BY 1`,
    outputSchema: [DAY('week'), STR('source'), NUM('kg')],
    visualization: bar('week', ['kg'], 'source', { stacking: 'STACKED' }),
  },
  {
    key: 'line_fill_weight',
    title: 'Fill weight above target by day (g/capsule)',
    description: 'Checkweigher mean minus target mass, Americano and Grande Intenso. Since the dosing-auger profile change, line 1 overfills by ~0.45 g/capsule; line 2 stays at ~0.12 g.',
    parameters: DATE_PARAMS,
    sql: `
WITH d AS (
  SELECT shift_date, line_code, sum((mean_g - target_g) * n_samples) / sum(n_samples) AS g
  FROM ${T('fact_checkweigher_shift')}
  WHERE sku IN (12450001, 12450003) AND shift_date > ${LATEST_DATE} - interval '60' day${dateFilter('shift_date')}
  GROUP BY 1, 2
)
SELECT shift_date AS day, max(CASE WHEN line_code = 'CAP_L1' THEN g END) AS line_1, max(CASE WHEN line_code = 'CAP_L2' THEN g END) AS line_2
FROM d GROUP BY 1 ORDER BY 1`,
    outputSchema: [DAY('day'), NUM('line_1'), NUM('line_2')],
    visualization: line('day', ['line_1', 'line_2'], null, { valueFormatting: { style: 'NUMBER', decimalPlaces: 2 } }),
  },
  {
    key: 'bar_manual_vs_machine',
    title: 'Logged loss versus machine data (kg/week)',
    description: 'The operators’ shift log against the machine material balance. The machine separates out the overfill — the part operators cannot see.',
    parameters: [LINE_PARAM],
    sql: `
WITH m AS (
  SELECT shift_date, shift_code, line_code, sum(reject_kg + purge_kg + unexplained_kg) AS machine_excl_overfill, sum(giveaway_kg) AS overfill
  FROM ${T('fact_material_balance_shift')} GROUP BY 1, 2, 3
),
j AS (
  SELECT date_trunc('week', m.shift_date) AS week, sum(o.reported_waste_kg) AS manual, sum(m.machine_excl_overfill) AS machine, sum(m.overfill) AS overfill
  FROM m LEFT JOIN ${T('fact_operator_log')} o ON o.shift_date = m.shift_date AND o.shift_code = m.shift_code AND o.line_code = m.line_code
  WHERE m.shift_date > ${LATEST_DATE} - interval '84' day${lineFilter('m.line_code')}
  GROUP BY 1
)
SELECT CAST(week AS date) AS week, source, kg FROM j
CROSS JOIN UNNEST(ARRAY['Shift log (manual)', 'Machine: rejects + purge + unexplained', 'Machine: overfill'], ARRAY[manual, machine, overfill]) AS t(source, kg)
ORDER BY 1`,
    outputSchema: [DAY('week'), STR('source'), NUM('kg')],
    visualization: bar('week', ['kg'], 'source'),
  },
  {
    key: 'bar_log_blank_rate',
    title: 'Shifts that left the loss field blank (%)',
    description: 'Share of operating shifts that did not log a coffee loss figure in the shift log, 120 days.',
    parameters: [LINE_PARAM],
    sql: `
SELECT CASE shift_code WHEN 'SHIFT_1' THEN 'Shift 1 (06–14h)' WHEN 'SHIFT_2' THEN 'Shift 2 (14–22h)' ELSE 'Shift 3 (22–06h)' END AS shift,
       100.0 * avg(CASE WHEN reported_waste_kg IS NULL THEN 1 ELSE 0 END) AS blank_pct
FROM ${T('fact_operator_log')}
WHERE 1 = 1${lineFilter()}
GROUP BY 1 ORDER BY 1`,
    outputSchema: [STR('shift'), NUM('blank_pct')],
    visualization: bar('shift', ['blank_pct'], null, { showLabels: true, valueFormatting: pct }),
  },
  {
    key: 'bar_changeover_purge',
    title: 'Changeover purge by changeover type (kg, 30 days)',
    description: 'Every recipe change purges the old powder. Going from a milk recipe to roast & ground needs a wet clean — the most expensive.',
    parameters: [LINE_PARAM],
    sql: `
SELECT CASE cleaning WHEN 'WET' THEN 'Wet clean (milk → R&G)' WHEN 'DRY_CLEAN' THEN 'Dry clean (to milk)' ELSE 'Dry powder purge' END AS type,
       count(*) AS changeovers, sum(purge_kg) AS kg
FROM ${T('fact_changeover')}
WHERE start_ts > ${LATEST_DAY} - interval '30' day${lineFilter()}
GROUP BY 1 ORDER BY kg DESC`,
    outputSchema: [STR('type'), INT('changeovers'), NUM('kg')],
    visualization: bar('type', ['kg'], null, { orientation: 'HORIZONTAL', showLabels: true }),
  },
  {
    key: 'table_top_loss_shifts',
    title: 'Shifts with the largest loss (14 days)',
    description: 'What the machines recorded versus what the operators wrote in the shift log.',
    parameters: [LINE_PARAM],
    sql: `
WITH m AS (
  SELECT shift_date, shift_code, line_code, sum(loss_kg) AS machine_kg, sum(giveaway_kg) AS overfill_kg, sum(loss_vnd) / 1e6 AS vnd_million
  FROM ${T('fact_material_balance_shift')} WHERE shift_date > ${LATEST_DATE} - interval '14' day GROUP BY 1, 2, 3
)
SELECT m.shift_date AS day, replace(m.shift_code, 'SHIFT_', 'Shift ') AS shift, m.line_code AS line,
       round(m.machine_kg, 1) AS machine_kg, round(m.overfill_kg, 1) AS overfill_kg, round(o.reported_waste_kg, 1) AS manual_kg, round(m.vnd_million, 1) AS vnd_million
FROM m LEFT JOIN ${T('fact_operator_log')} o ON o.shift_date = m.shift_date AND o.shift_code = m.shift_code AND o.line_code = m.line_code
WHERE 1 = 1${lineFilter('m.line_code')}
ORDER BY m.machine_kg DESC LIMIT 15`,
    outputSchema: [DAY('day'), STR('shift'), STR('line'), NUM('machine_kg'), NUM('overfill_kg'), NUM('manual_kg'), NUM('vnd_million')],
    visualization: table(['day', 'shift', 'line', 'machine_kg', 'overfill_kg', 'manual_kg', 'vnd_million']),
  },

  /* ── Line operations ──────────────────────────────────────────────────── */
  {
    key: 'line_hourly_output',
    title: 'Hourly output (capsules, 72 hours)',
    description: 'Good capsules through the checkweigher each hour. The dips are recipe changeovers or stops.',
    parameters: [LINE_PARAM],
    sql: `
SELECT CAST(ts AS timestamp(0)) AS hour, line_code AS line, good_qty AS capsules
FROM ${T('fact_production_hourly')}
WHERE workcenter_code LIKE '%CAP_INSPECT' AND ts > ${LATEST} - interval '72' hour${lineFilter()}
ORDER BY 1`,
    outputSchema: [TS('hour'), STR('line'), INT('capsules')],
    visualization: line('hour', ['capsules'], 'line'),
  },
  {
    key: 'line_daily_oee',
    title: 'Daily OEE (%)',
    description: 'Daily OEE of each line, 60 days.',
    parameters: [...DATE_PARAMS, LINE_PARAM, SHIFT_PARAM],
    sql: `
SELECT shift_date AS day, line_code AS line, 100.0 * ${OEE_ROLLUP_SQL} AS oee
FROM ${T('fact_oee_shift')}
WHERE workcenter_code LIKE '%${LINE_OEE_STATION}' AND available_s > 0 AND shift_date > ${LATEST_DATE} - interval '60' day${dateFilter('shift_date')}${lineFilter()}${shiftFilter()}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [DAY('day'), STR('line'), NUM('oee')],
    visualization: line('day', ['oee'], 'line', { axes: { y: { title: 'OEE (%)', min: 40, max: 100 } }, valueFormatting: pct }),
  },
  {
    key: 'bar_stop_pareto',
    title: 'Stop cause Pareto (minutes, 14 days)',
    description: 'Total stop minutes by PLC fault code, last 14 days. Sunday CIP cleaning excluded.',
    parameters: [...DATE_PARAMS, LINE_PARAM],
    sql: `
SELECT ${faultName('fault_code')} AS cause, sum(duration_s) / 60.0 AS minutes
FROM ${T('fact_stop_event')}
WHERE start_ts > ${LATEST_DAY} - interval '14' day AND fault_code <> 'P020'${dateFilter('start_ts')}${lineFilter()}
GROUP BY 1 ORDER BY minutes DESC LIMIT 10`,
    outputSchema: [STR('cause'), NUM('minutes')],
    visualization: bar('cause', ['minutes'], null, { orientation: 'HORIZONTAL', showLabels: true }),
  },
  {
    key: 'line_weekly_changeovers',
    title: 'Recipe changeovers per week',
    description: 'Recipe changes per week and line — a direct consequence of how the schedule is built.',
    parameters: [LINE_PARAM],
    sql: `
SELECT CAST(date_trunc('week', start_ts) AS date) AS week, line_code AS line, count(*) AS changeovers
FROM ${T('fact_changeover')}
WHERE 1 = 1${lineFilter()}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [DAY('week'), STR('line'), INT('changeovers')],
    visualization: bar('week', ['changeovers'], 'line', { stacking: 'STACKED' }),
  },
  {
    key: 'line_minor_stops_l1',
    title: 'Minor stops (< 2 minutes) per day',
    description: 'Minor stops per day. On line 1 (no sensors yet) this is the only early warning before a breakdown.',
    parameters: [LINE_PARAM],
    sql: `
SELECT CAST(date_trunc('day', start_ts) AS date) AS day, line_code AS line, count(*) AS stops
FROM ${T('fact_stop_event')}
WHERE duration_s < 120 AND fault_code LIKE 'F%' AND start_ts > ${LATEST_DAY} - interval '30' day${lineFilter()}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [DAY('day'), STR('line'), INT('stops')],
    visualization: line('day', ['stops'], 'line'),
  },
  {
    key: 'table_process_orders',
    title: 'Latest process orders',
    description: 'SAP process orders (AUFNR) per batch, planned and actual.',
    parameters: [LINE_PARAM],
    sql: `
SELECT process_order AS order_no, line_code AS line, ${skuName('sku')} AS product,
       planned_boxes AS planned_boxes, delivered_boxes AS actual_boxes, CAST(actual_start AS timestamp(0)) AS start_time, CAST(actual_end AS timestamp(0)) AS end_time, status AS status
FROM ${T('fact_process_order')}
WHERE 1 = 1${lineFilter()}
ORDER BY actual_start DESC LIMIT 20`,
    outputSchema: [STR('order_no'), STR('line'), STR('product'), INT('planned_boxes'), INT('actual_boxes'), TS('start_time'), TS('end_time'), STR('status')],
    visualization: table(['order_no', 'line', 'product', 'planned_boxes', 'actual_boxes', 'start_time', 'end_time', 'status']),
  },

  /* ── Demand forecast & production plan (UC2) ──────────────────────────── */
  {
    key: 'line_demand_plan_forecast',
    title: 'Actual demand, 6-month plan and rolling forecast (boxes/week)',
    description: 'The 6-month plan is made once every half year; the Minder forecast updates every week (the "4 weeks ahead" line is the forecast made 4 weeks before that week).',
    parameters: [],
    sql: `
WITH lim AS (SELECT max(week_start) - interval '182' day AS t FROM ${T('fact_shipment_weekly')}),
act AS (SELECT week_start AS w, sum(shipped_boxes) AS v FROM ${T('fact_shipment_weekly')} GROUP BY 1),
pl AS (SELECT week_start AS w, sum(planned_boxes) AS v FROM ${T('fact_demand_plan_semiannual')} GROUP BY 1),
bt AS (SELECT target_start AS w, sum(p50) AS v FROM ${T('fact_demand_forecast')} WHERE is_backtest AND lead = 4 GROUP BY 1),
fu AS (SELECT target_start AS w, sum(p50) AS v FROM ${T('fact_demand_forecast')} WHERE NOT is_backtest GROUP BY 1),
weeks AS (SELECT w FROM act UNION SELECT w FROM fu)
SELECT k.w AS week, act.v AS actual, pl.v AS plan_6m, bt.v AS forecast_4w_ahead, fu.v AS forecast_next_13w
FROM weeks k LEFT JOIN act ON act.w = k.w LEFT JOIN pl ON pl.w = k.w LEFT JOIN bt ON bt.w = k.w LEFT JOIN fu ON fu.w = k.w
WHERE k.w > (SELECT t FROM lim)
ORDER BY 1`,
    outputSchema: [DAY('week'), NUM('actual'), NUM('plan_6m'), NUM('forecast_4w_ahead'), NUM('forecast_next_13w')],
    visualization: line('week', ['actual', 'plan_6m', 'forecast_4w_ahead', 'forecast_next_13w'], null),
  },
  {
    key: 'bar_forecast_error',
    title: 'Forecast error – this half year (WAPE, %)',
    description: 'Weighted absolute percentage error over every SKU × market × week. Lower is better.',
    parameters: [],
    sql: `
WITH last AS (SELECT max(week_start) AS w FROM ${T('fact_shipment_weekly')}),
h AS (SELECT CASE WHEN week_of_year((SELECT w FROM last)) >= 27 THEN 27 ELSE 1 END AS wk0, year((SELECT w FROM last) + interval '3' day) AS yr),
act AS (
  SELECT a.sku, a.market, a.week_start, a.shipped_boxes AS y FROM ${T('fact_shipment_weekly')} a
  WHERE year(a.week_start + interval '3' day) = (SELECT yr FROM h) AND week_of_year(a.week_start) >= (SELECT wk0 FROM h)
),
plan_err AS (
  SELECT '6-month plan' AS method, sum(abs(a.y - p.planned_boxes)) * 1.0 / sum(a.y) AS e
  FROM act a JOIN ${T('fact_demand_plan_semiannual')} p ON p.sku = a.sku AND p.market = a.market AND p.week_start = a.week_start
),
fc AS (
  SELECT CASE lead WHEN 4 THEN 'Minder – 4 weeks ahead' ELSE 'Minder – 13 weeks ahead' END AS method, sum(abs(actual - p50)) / sum(actual) AS e
  FROM ${T('fact_demand_forecast')} f
  WHERE is_backtest AND f.target_start >= (SELECT min(week_start) FROM act)
  GROUP BY 1
)
SELECT method, 100 * e AS wape FROM plan_err UNION ALL SELECT method, 100 * e FROM fc ORDER BY 2 DESC`,
    outputSchema: [STR('method'), NUM('wape')],
    visualization: bar('method', ['wape'], null, { showLabels: true, valueFormatting: pct }),
  },
  {
    key: 'line_forecast_13w',
    title: 'Forecast for the next 13 weeks and capacity (boxes/week)',
    description: 'P10 / P50 / P90 forecast summed over every SKU and market, against the capacity of the 2 lines at their last-30-day OEE.',
    parameters: [],
    sql: `
WITH cap AS (
  SELECT sum(8640 * CASE line_code WHEN 'CAP_L1' THEN 405 ELSE 480 END * oee) / 16 AS boxes FROM (
    SELECT line_code, ${OEE_ROLLUP_SQL} AS oee FROM ${T('fact_oee_shift')}
    WHERE workcenter_code LIKE '%${LINE_OEE_STATION}' AND shift_date > ${LATEST_DATE} - interval '30' day GROUP BY line_code)
),
f AS (SELECT target_start, sum(p10) AS p10, sum(p50) AS p50, sum(p90) AS p90 FROM ${T('fact_demand_forecast')} WHERE NOT is_backtest GROUP BY 1)
SELECT target_start AS week, p10, p50, p90, (SELECT boxes FROM cap) AS capacity FROM f ORDER BY 1`,
    outputSchema: [DAY('week'), NUM('p10'), NUM('p50'), NUM('p90'), NUM('capacity')],
    visualization: line('week', ['p10', 'p50', 'p90', 'capacity'], null),
  },
  {
    key: 'bar_capacity_load',
    title: 'Capacity load, next 13 weeks (%)',
    description: 'Forecast demand (P50) divided by capacity. Above 100% is a week that needs pre-building or an extra Sunday shift.',
    parameters: [],
    sql: `
WITH cap AS (
  SELECT sum(8640 * CASE line_code WHEN 'CAP_L1' THEN 405 ELSE 480 END * oee) / 16 AS boxes FROM (
    SELECT line_code, ${OEE_ROLLUP_SQL} AS oee FROM ${T('fact_oee_shift')}
    WHERE workcenter_code LIKE '%${LINE_OEE_STATION}' AND shift_date > ${LATEST_DATE} - interval '30' day GROUP BY line_code)
)
SELECT concat('W', iso_week) AS week, 100 * sum(p50) / (SELECT boxes FROM cap) AS load_pct
FROM ${T('fact_demand_forecast')} WHERE NOT is_backtest GROUP BY iso_week ORDER BY iso_week`,
    outputSchema: [STR('week'), NUM('load_pct')],
    visualization: bar('week', ['load_pct'], null, { showLabels: true, valueFormatting: { style: 'NUMBER', decimalPlaces: 0, suffix: '%' } }),
  },
  {
    key: 'bar_stock_cover_by_sku',
    title: 'Stock cover by product (days)',
    description: 'Current finished-goods stock divided by average daily shipments over the last 4 weeks. Target 10 days.',
    parameters: [],
    sql: `
WITH d AS (SELECT max(stock_date) AS d FROM ${T('fact_fg_stock_daily')}),
st AS (SELECT sku, sum(stock_boxes) AS s FROM ${T('fact_fg_stock_daily')} WHERE stock_date = (SELECT d FROM d) GROUP BY sku),
sh AS (SELECT sku, sum(shipped_boxes) / 24.0 AS per_day FROM ${T('fact_shipment_weekly')}
        WHERE week_start > (SELECT max(week_start) FROM ${T('fact_shipment_weekly')}) - interval '28' day GROUP BY sku)
SELECT ${skuName('st.sku')} AS product, st.s / sh.per_day AS days FROM st JOIN sh ON sh.sku = st.sku ORDER BY 2`,
    outputSchema: [STR('product'), NUM('days')],
    visualization: bar('product', ['days'], null, { orientation: 'HORIZONTAL', showLabels: true, valueFormatting: { style: 'NUMBER', decimalPlaces: 1 } }),
  },
  {
    key: 'line_ph_th_actual_vs_plan',
    title: 'Iced milk coffee & Americano in the Philippines and Thailand: actual vs plan',
    description: 'Since the new retail listings, demand has run well above the 6-month plan; the rolling forecast catches up within a few weeks.',
    parameters: [],
    sql: `
WITH k AS (SELECT max(week_start) - interval '140' day AS t FROM ${T('fact_shipment_weekly')}),
act AS (SELECT week_start AS w, sum(shipped_boxes) AS v FROM ${T('fact_shipment_weekly')} WHERE market IN ('PH', 'TH') AND sku IN (12450005, 12450001) GROUP BY 1),
pl AS (SELECT week_start AS w, sum(planned_boxes) AS v FROM ${T('fact_demand_plan_semiannual')} WHERE market IN ('PH', 'TH') AND sku IN (12450005, 12450001) GROUP BY 1),
bt AS (SELECT target_start AS w, sum(p50) AS v FROM ${T('fact_demand_forecast')} WHERE market IN ('PH', 'TH') AND sku IN (12450005, 12450001) AND is_backtest AND lead = 4 GROUP BY 1),
fu AS (SELECT target_start AS w, sum(p50) AS v FROM ${T('fact_demand_forecast')} WHERE market IN ('PH', 'TH') AND sku IN (12450005, 12450001) AND NOT is_backtest GROUP BY 1),
weeks AS (SELECT w FROM act UNION SELECT w FROM fu)
SELECT x.w AS week, act.v AS actual, pl.v AS plan_6m, bt.v AS forecast_4w_ahead, fu.v AS forecast_next_13w
FROM weeks x LEFT JOIN act ON act.w = x.w LEFT JOIN pl ON pl.w = x.w LEFT JOIN bt ON bt.w = x.w LEFT JOIN fu ON fu.w = x.w
WHERE x.w > (SELECT t FROM k)
ORDER BY 1`,
    outputSchema: [DAY('week'), NUM('actual'), NUM('plan_6m'), NUM('forecast_4w_ahead'), NUM('forecast_next_13w')],
    visualization: line('week', ['actual', 'plan_6m', 'forecast_4w_ahead', 'forecast_next_13w'], null),
  },

  /* ── Weekly production schedule (UC3) ─────────────────────────────────── */
  {
    key: 'table_minder_schedule',
    title: 'Next week’s production schedule – Minder proposal',
    description: 'Schedule built by the Minder scheduler: campaigns grouped by recipe family, humidity-risk windows avoided, maintenance windows kept free.',
    parameters: [LINE_PARAM],
    sql: `
SELECT s.line_code AS line, CAST(s.start_ts AS timestamp(0)) AS start_time, CAST(s.end_ts AS timestamp(0)) AS end_time, ${skuName('s.sku')} AS product, s.planned_boxes AS boxes, s.note AS note
FROM ${T('fact_plan_slot')} s JOIN ${T('fact_plan_header')} h ON h.plan_id = s.plan_id
WHERE h.source = 'MINDER_AI' AND h.plan_week = (SELECT max(plan_week) FROM ${T('fact_plan_header')} WHERE source = 'MINDER_AI')${lineFilter('s.line_code')}
ORDER BY s.line_code, s.start_ts`,
    outputSchema: [STR('line'), TS('start_time'), TS('end_time'), STR('product'), INT('boxes'), STR('note')],
    visualization: table(['line', 'start_time', 'end_time', 'product', 'boxes', 'note'], { pageSize: 16 }),
  },
  {
    key: 'bar_manual_vs_minder_changeovers',
    title: 'Manual vs Minder schedule: changeovers per week',
    description: 'Planned changeovers and wet cleans: average of the hand-made weeks versus next week planned by Minder.',
    parameters: [],
    sql: `
WITH s AS (
  SELECT h.source, h.plan_id, p.line_code, p.start_ts, k.family,
         lag(k.family) OVER (PARTITION BY p.plan_id, p.line_code ORDER BY p.start_ts) AS prev_family,
         lag(p.sku) OVER (PARTITION BY p.plan_id, p.line_code ORDER BY p.start_ts) AS prev_sku, p.sku
  FROM ${T('fact_plan_slot')} p JOIN ${T('fact_plan_header')} h ON h.plan_id = p.plan_id JOIN ${T('dim_sku')} k ON k.sku = p.sku
),
c AS (
  SELECT source, plan_id,
         sum(CASE WHEN prev_sku IS NOT NULL AND prev_sku <> sku THEN 1 ELSE 0 END) AS changeovers,
         sum(CASE WHEN prev_family = 'MILK' AND family <> 'MILK' THEN 1 ELSE 0 END) AS wet_cleans
  FROM s GROUP BY 1, 2
),
a AS (SELECT CASE source WHEN 'MINDER_AI' THEN 'Minder (next week)' ELSE 'Manual (average)' END AS plan, avg(changeovers) AS changeovers, avg(wet_cleans) AS wet_cleans FROM c GROUP BY 1)
SELECT plan, metric, value FROM a
CROSS JOIN UNNEST(ARRAY['Changeovers / week', 'Wet cleans / week'], ARRAY[changeovers, wet_cleans]) AS t(metric, value)`,
    outputSchema: [STR('plan'), STR('metric'), NUM('value')],
    visualization: bar('metric', ['value'], 'plan', { showLabels: true, valueFormatting: { style: 'NUMBER', decimalPlaces: 1 } }),
  },
  {
    key: 'bar_planned_purge',
    title: 'Planned purge (kg/week): manual vs Minder',
    description: 'Powder that has to be purged because of the recipe order in the schedule, from the changeover matrix.',
    parameters: [],
    sql: `
WITH s AS (
  SELECT h.source, p.plan_id, p.sku, k.family,
         lag(p.sku) OVER (PARTITION BY p.plan_id, p.line_code ORDER BY p.start_ts) AS prev_sku,
         lag(k.family) OVER (PARTITION BY p.plan_id, p.line_code ORDER BY p.start_ts) AS prev_family
  FROM ${T('fact_plan_slot')} p JOIN ${T('fact_plan_header')} h ON h.plan_id = p.plan_id JOIN ${T('dim_sku')} k ON k.sku = p.sku
),
kg AS (
  SELECT s.source, s.plan_id, sum(m.purge_kg) AS kg
  FROM s JOIN ${T('dim_changeover_matrix')} m ON m.from_family = s.prev_family AND m.to_family = s.family
  WHERE s.prev_sku IS NOT NULL AND s.prev_sku <> s.sku GROUP BY 1, 2
)
SELECT CASE source WHEN 'MINDER_AI' THEN 'Minder (next week)' ELSE 'Manual (average)' END AS plan, avg(kg) AS kg FROM kg GROUP BY 1 ORDER BY 2 DESC`,
    outputSchema: [STR('plan'), NUM('kg')],
    visualization: bar('plan', ['kg'], null, { showLabels: true, valueFormatting: { style: 'NUMBER', decimalPlaces: 0 } }),
  },
  {
    key: 'bar_planning_hours',
    title: 'Planning effort per week (hours)',
    description: 'Planner hours spent building the weekly schedule, against one automatic Minder run.',
    parameters: [],
    sql: `
SELECT plan_week AS week, CASE source WHEN 'MINDER_AI' THEN 'Minder' ELSE 'Manual' END AS plan, effort_hours AS hours
FROM ${T('fact_plan_header')} ORDER BY plan_week`,
    outputSchema: [STR('week'), STR('plan'), NUM('hours')],
    visualization: bar('week', ['hours'], 'plan'),
  },
  {
    key: 'line_plan_adherence',
    title: 'Weekly plan adherence (%)',
    description: 'Σ min(actual, plan) per SKU divided by Σ plan, for each hand-made week. Hand-made schedules assume 85% OEE, so they usually promise more than the lines can deliver.',
    parameters: [],
    sql: `
WITH plan AS (
  SELECT h.plan_week, p.sku, sum(p.planned_boxes) AS planned, min(p.start_ts) AS w0
  FROM ${T('fact_plan_slot')} p JOIN ${T('fact_plan_header')} h ON h.plan_id = p.plan_id
  WHERE h.source = 'MANUAL' GROUP BY 1, 2
),
wk AS (SELECT plan_week, min(w0) AS w0 FROM plan GROUP BY 1),
act AS (
  SELECT w.plan_week, p.sku, sum(p.good_qty) AS actual
  FROM ${T('fact_production_hourly')} p JOIN wk w ON p.ts >= w.w0 AND p.ts < w.w0 + interval '7' day
  WHERE p.workcenter_code LIKE '%BOX_CHECK' GROUP BY 1, 2
)
SELECT pl.plan_week AS week, 100.0 * sum(least(coalesce(a.actual, 0), pl.planned)) / sum(pl.planned) AS adherence
FROM plan pl LEFT JOIN act a ON a.plan_week = pl.plan_week AND a.sku = pl.sku
WHERE pl.w0 + interval '7' day <= ${LATEST}
GROUP BY 1 ORDER BY 1`,
    outputSchema: [STR('week'), NUM('adherence')],
    visualization: line('week', ['adherence'], null, { markers: true, valueFormatting: pct, axes: { y: { min: 50, max: 100 } } }),
  },

  /* ── Room environment & equipment (UC4 / UC5) ─────────────────────────── */
  {
    key: 'line_room_humidity',
    title: 'Filling-room humidity (%RH, 14 days)',
    description: 'Relative humidity of the two filling zones. Alarm limit 45%, line stop 50%.',
    parameters: DATE_PARAMS,
    sql: `
SELECT CAST(date_trunc('hour', ts) AS timestamp(0)) AS hour, CASE tag WHEN 'FILL_Z1.RH' THEN 'L1 zone' ELSE 'L2 zone' END AS zone, avg(value) AS rh
FROM ${T('fact_signal')}
WHERE tag IN ('FILL_Z1.RH', 'FILL_Z2.RH') AND ts > (SELECT max(ts) FROM ${T('fact_signal')} WHERE source = 'HISTORIAN') - interval '14' day${dateFilter('ts')}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [TS('hour'), STR('zone'), NUM('rh')],
    visualization: line('hour', ['rh'], 'zone', { valueFormatting: { style: 'NUMBER', decimalPlaces: 1, suffix: '%' } }),
  },
  {
    key: 'line_humidity_risk',
    title: 'Humidity risk forecast, next 7 days (score 0–100)',
    description: 'Each hour: forecast outdoor dew point (45%), deviation of the AHU desiccant-wheel current (35%), current room humidity (20%). ≥ 65 = HIGH: do not run milk recipes.',
    parameters: [],
    sql: `
SELECT CAST(ts AS timestamp(0)) AS hour, CASE room_code WHEN 'FILL_Z1' THEN 'L1 zone (AHU-01)' ELSE 'L2 zone (AHU-02)' END AS zone, 100 * risk AS score
FROM ${T('fact_room_risk')} WHERE is_forecast ORDER BY 1`,
    outputSchema: [TS('hour'), STR('zone'), NUM('score')],
    visualization: line('hour', ['score'], 'zone', { axes: { y: { min: 0, max: 100 } } }),
  },
  {
    key: 'line_ahu_wheel_current',
    title: 'AHU desiccant-wheel current (A, daily mean)',
    description: 'The current rises as the desiccant wheel wears or binds. AHU-02 rose before the August humidity incident and is rising again.',
    parameters: DATE_PARAMS,
    sql: `
SELECT CAST(date_trunc('day', ts) AS date) AS day, CASE tag WHEN 'AHU01.WHEEL_A' THEN 'AHU-01' ELSE 'AHU-02' END AS ahu, avg(value) AS amps
FROM ${T('fact_signal')}
WHERE tag IN ('AHU01.WHEEL_A', 'AHU02.WHEEL_A') AND ts > (SELECT max(ts) FROM ${T('fact_signal')} WHERE source = 'HISTORIAN') - interval '75' day${dateFilter('ts')}
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [DAY('day'), STR('ahu'), NUM('amps')],
    visualization: line('day', ['amps'], 'ahu', { valueFormatting: { style: 'NUMBER', decimalPlaces: 2 } }),
  },
  {
    key: 'table_asset_health',
    title: 'Asset health',
    description: 'Index 0–100 against the asset’s own 28-day baseline; RUL = estimated days to the alarm limit on the 72-hour trend.',
    parameters: [],
    sql: `
SELECT a.asset_name AS asset, h.health AS score, h.label AS status, a.signals
FROM ${T('dm_asset_health')} h JOIN ${T('dim_asset')} a ON a.asset_code = h.asset_code
ORDER BY coalesce(h.health, 999)`,
    outputSchema: [STR('asset'), NUM('score'), STR('status'), STR('signals')],
    visualization: table(['asset', 'score', 'status', 'signals'], { pageSize: 17 }),
  },
  {
    key: 'line_auger_vibration',
    title: 'L2 dosing-auger vibration against the limit (mm/s)',
    description: 'Dosing-auger gearbox vibration, 2-hour mean, 30 days; alarm limit 4.5 mm/s. A steady rise since 9 days ago.',
    parameters: [],
    sql: `
WITH v AS (
  SELECT from_unixtime(floor(to_unixtime(ts) / 7200) * 7200) AS hour, avg(value) AS vibration
  FROM ${T('fact_signal')}
  WHERE tag = 'DOSE_AUGER_L2.VIB_MMS' AND ts > (SELECT max(ts) FROM ${T('fact_signal')} WHERE tag = 'DOSE_AUGER_L2.VIB_MMS') - interval '30' day
  GROUP BY 1
)
SELECT CAST(hour AS timestamp(0)) AS hour, vibration, 4.5 AS threshold FROM v ORDER BY 1`,
    outputSchema: [TS('hour'), NUM('vibration'), NUM('threshold')],
    visualization: line('hour', ['vibration', 'threshold'], null, { valueFormatting: { style: 'NUMBER', decimalPlaces: 2 } }),
  },
  {
    key: 'line_seal_heater_lookback',
    title: 'Looking back: L2-B lid seal heater health before the failure',
    description: 'The health index fell below 60 about 6 days before the heater failed (a 192-minute stop). With that warning the replacement could have gone into the Sunday maintenance window.',
    parameters: [],
    sql: `
WITH f AS (SELECT min(start_ts) AS t FROM ${T('fact_stop_event')} WHERE fault_code = 'F310' AND line_code = 'CAP_L2' AND duration_s >= 10000)
SELECT CAST(ts AS timestamp(0)) AS hour, health AS health, 60 AS alert_threshold
FROM ${T('fact_asset_health')}
WHERE asset_code = 'SEAL_HEATER_L2_B' AND ts BETWEEN (SELECT t FROM f) - interval '12' day AND (SELECT t FROM f) + interval '3' day
ORDER BY 1`,
    outputSchema: [TS('hour'), NUM('health'), INT('alert_threshold')],
    visualization: line('hour', ['health', 'alert_threshold'], null, { axes: { y: { min: 0, max: 100 } } }),
  },
  {
    key: 'line_humidity_incident',
    title: 'L2 zone humidity incident: room humidity and outdoor dew point',
    description: 'The half-day humidity stop: the AHU-02 desiccant wheel weakened for 4 days, then a thunderstorm pushed room humidity above 50%.',
    parameters: [],
    sql: `
WITH e AS (SELECT min(start_ts) AS t FROM ${T('fact_stop_event')} WHERE fault_code = 'E001')
SELECT CAST(date_trunc('hour', ts) AS timestamp(0)) AS hour, CASE tag WHEN 'FILL_Z2.RH' THEN 'L2 room humidity (%)' ELSE 'Outdoor dew point (°C)' END AS metric, avg(value) AS value
FROM ${T('fact_signal')}
WHERE tag IN ('FILL_Z2.RH', 'WX.DP') AND ts BETWEEN (SELECT t FROM e) - interval '4' day AND (SELECT t FROM e) + interval '1' day
GROUP BY 1, 2 ORDER BY 1`,
    outputSchema: [TS('hour'), STR('metric'), NUM('value')],
    visualization: line('hour', ['value'], 'metric'),
  },
];

export const CHARTS = RAW_CHARTS.map(ordered);

/* ── Static validation (same checks as the Demo Data 1 pack) ────────────── */

function boundFields(visualization) {
  const { type, roles, display } = visualization;
  const fields = [];
  if (type === 'NUMBER') {
    fields.push(roles.measure);
    if (display?.comparison?.field) fields.push(display.comparison.field);
  } else if (type === 'TABLE') fields.push(...roles.columns);
  else fields.push(roles.x ?? roles.category, ...(roles.measures ?? []), roles.series, roles.breakout);
  return fields.filter((field) => typeof field === 'string');
}

export function validateCharts(charts = CHARTS, knownTables = undefined) {
  const problems = [];
  const titles = new Map();
  const tablePattern = new RegExp(`iceberg\\.${CURATED_DATABASE}\\.([a-z_]+)`, 'gu');
  for (const chart of charts) {
    const schema = new Set(chart.outputSchema.map((column) => column.name));
    for (const field of boundFields(chart.visualization)) {
      if (!schema.has(field)) problems.push(`${chart.key}: binds "${field}", which the query does not return`);
    }
    const declared = new Set(chart.parameters.map((p) => p.name));
    const used = new Set([...chart.sql.matchAll(/\{\{\s*([A-Za-z_]\w*)\s*\}\}/gu)].map((match) => match[1]));
    for (const name of used) if (!declared.has(name)) problems.push(`${chart.key}: uses undeclared {{${name}}}`);
    for (const name of declared) if (!used.has(name)) problems.push(`${chart.key}: declares unused ${name}`);
    const outside = chart.sql.replace(/\[\[[\s\S]*?\]\]/gu, '');
    if (/\{\{/u.test(outside)) problems.push(`${chart.key}: a parameter sits outside [[...]]`);
    if (knownTables) {
      for (const match of chart.sql.matchAll(tablePattern)) {
        if (!knownTables.has(match[1])) problems.push(`${chart.key}: reads unknown table ${match[1]}`);
      }
    }
    if (titles.has(chart.title)) problems.push(`${chart.key}: shares its title with ${titles.get(chart.title)}`);
    titles.set(chart.title, chart.key);
  }
  return problems;
}

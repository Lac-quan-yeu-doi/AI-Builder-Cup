/**
 * The curated warehouse contract for Demo Data 2 (coffee capsules):
 * `iceberg.demo2_coffee_capsules`.
 *
 * One definition of every curated column, shared by the pipelines that build
 * the tables (seed/03-seed-data-platform.mjs) and the charts that read them. It
 * carries the Demo Data 1 lessons forward:
 *
 *  - No JOIN node: every derived table reads exactly ONE curated table. Signals
 *    land in one long table (`fact_signal`) through separate APPEND pipelines so
 *    health and humidity risk stay single-input; cross-source comparisons
 *    (manual log vs machine, plan vs actual) are joined in chart SQL in Trino.
 *  - Every derived query is a `WITH …` statement. Core's MANUAL_SQL analyzer then
 *    skips column inference (it cannot follow window frames or LATERAL VIEW) and
 *    the target must be CREATE_NEW or OVERWRITE — which is what we use.
 *  - Constants the SQL needs (alarm limits, prices, SKU families) are GENERATED
 *    here from reference.mjs, never typed twice.
 *  - Each formula mirrors the JS reference in generate.mjs, so the
 *    warehouse reproduces the numbers the generator asserted.
 */
import { ASSETS, DEMO, HEALTH, RISK, SKUS } from './reference.mjs';

export const CURATED_DATABASE = DEMO.database;
export const SOURCE_SCHEMA = DEMO.sourceSchema;

/** `[sourceField, targetField, sparkType]` in output order. */
const m = (...rows) => rows;

/** Dimensions: master data, mostly passthrough with canonical names and types. */
export const DIMENSIONS = Object.freeze({
  dim_sku: { sourceTable: 'md_material', mappings: m(
    ['matnr', 'sku', 'long'], ['short_code', 'short_code', 'string'], ['product_name', 'product_name', 'string'],
    ['family', 'family', 'string'], ['contains_milk', 'contains_milk', 'boolean'], ['capsules_per_box', 'capsules_per_box', 'int'],
    ['target_fill_g', 'target_fill_g', 'double'], ['tolerance_g', 'tolerance_g', 'double'], ['rh_max_pct', 'rh_max_pct', 'int'],
    ['eligible_lines', 'eligible_lines', 'string'], ['auger_profile', 'auger_profile', 'string'], ['demand_share', 'demand_share', 'double'],
  ) },
  dim_family: { sourceTable: 'md_family', mappings: m(
    ['family', 'family', 'string'], ['name', 'family_name', 'string'], ['contains_milk', 'contains_milk', 'boolean'], ['seq', 'sequence', 'int'],
  ) },
  dim_material_cost: { sourceTable: 'md_material_cost', mappings: m(
    ['cost_code', 'cost_code', 'string'], ['name', 'name', 'string'], ['uom', 'uom', 'string'], ['price_vnd', 'price_vnd', 'long'],
  ) },
  dim_line: { sourceTable: 'md_line', mappings: m(
    ['line', 'line_code', 'string'], ['name', 'line_name', 'string'], ['year_commissioned', 'year_commissioned', 'int'],
    ['rate_rg_cpm', 'rate_rg_cpm', 'int'], ['rate_milk_cpm', 'rate_milk_cpm', 'int'], ['lanes', 'lanes', 'int'],
    ['has_iot', 'has_iot', 'boolean'], ['oee_target', 'oee_target', 'int'], ['zone', 'room_code', 'string'],
  ) },
  dim_workcenter: { sourceTable: 'md_workcenter', mappings: m(
    ['workcenter', 'workcenter_code', 'string'], ['line', 'line_code', 'string'], ['station', 'station', 'string'],
    ['name', 'workcenter_name', 'string'], ['short_name', 'short_name', 'string'], ['room', 'room_code', 'string'], ['seq', 'sequence', 'int'],
  ) },
  dim_asset: { sourceTable: 'md_asset', mappings: m(
    ['asset', 'asset_code', 'string'], ['name', 'asset_name', 'string'], ['kind', 'kind', 'string'],
    ['workcenter', 'workcenter_code', 'string'], ['signals', 'signals', 'string'], ['pm_days', 'pm_interval_days', 'int'], ['year', 'year_installed', 'int'],
  ) },
  dim_fault_code: { sourceTable: 'md_fault_code', mappings: m(
    ['fault_code', 'fault_code', 'string'], ['name', 'fault_name', 'string'], ['short_name', 'short_name', 'string'],
    ['category', 'category', 'string'], ['station', 'station', 'string'],
  ) },
  dim_reject_code: { sourceTable: 'md_reject_code', mappings: m(
    ['reject_code', 'reject_code', 'string'], ['name', 'reject_name', 'string'], ['station', 'station', 'string'], ['unit', 'unit', 'string'],
  ) },
  dim_changeover_matrix: { sourceTable: 'md_changeover_matrix', mappings: m(
    ['from_family', 'from_family', 'string'], ['to_family', 'to_family', 'string'], ['minutes', 'minutes', 'int'],
    ['purge_kg', 'purge_kg', 'double'], ['cleaning', 'cleaning', 'string'],
  ) },
  dim_shift: { sourceTable: 'md_shift', mappings: m(
    ['shift', 'shift_code', 'string'], ['name', 'shift_name', 'string'], ['start_hour', 'start_hour', 'int'], ['end_hour', 'end_hour', 'int'],
  ) },
  dim_market: { sourceTable: 'md_market', mappings: m(
    ['market', 'market', 'string'], ['name', 'market_name', 'string'], ['is_export', 'is_export', 'boolean'],
  ) },
  dim_room: { sourceTable: 'md_room', mappings: m(
    ['room', 'room_code', 'string'], ['name', 'room_name', 'string'], ['line', 'line_code', 'string'], ['ahu', 'ahu_code', 'string'],
    ['temp_target_c', 'temp_target_c', 'double'], ['rh_max_pct', 'rh_max_pct', 'int'], ['rh_alarm_pct', 'rh_alarm_pct', 'int'], ['rh_stop_pct', 'rh_stop_pct', 'int'],
  ) },
  dim_signal_tag: { sourceTable: 'hist_tag_dictionary', mappings: m(
    ['tag', 'tag', 'string'], ['asset', 'asset_code', 'string'], ['metric', 'metric', 'string'], ['unit', 'unit', 'string'], ['hi_alarm', 'hi_alarm', 'double'],
  ) },
});

/**
 * Facts. `fact_production_hourly` and `fact_process_order` are the ones to open
 * on camera: SAP's AUFNR / MATNR / GAMNG / WEMNG and the SCADA counters mapped to
 * readable canonical names in one CHANGE_SCHEMA panel.
 */
export const FACTS = Object.freeze({
  fact_shipment_weekly: { sourceTable: 'ibp_shipment_history', mappings: m(
    ['calweek', 'iso_week', 'string'], ['week_start', 'week_start', 'date'], ['matnr', 'sku', 'long'], ['market', 'market', 'string'],
    ['ship_box', 'shipped_boxes', 'int'], ['ship_pack', 'shipped_packs', 'int'],
  ) },
  fact_demand_plan_semiannual: { sourceTable: 'ibp_demand_plan', mappings: m(
    ['plan_vers', 'plan_version', 'string'], ['created_on', 'created_on', 'date'], ['calweek', 'iso_week', 'string'],
    ['week_start', 'week_start', 'date'], ['matnr', 'sku', 'long'], ['market', 'market', 'string'], ['plan_box', 'planned_boxes', 'int'],
  ) },
  fact_open_orders: { sourceTable: 'sd_open_orders', mappings: m(
    ['vbeln', 'sales_order', 'string'], ['posnr', 'item', 'int'], ['matnr', 'sku', 'long'], ['market', 'market', 'string'],
    ['req_week', 'required_week', 'string'], ['order_box', 'ordered_boxes', 'int'], ['status', 'status', 'string'],
  ) },
  fact_process_order: { sourceTable: 'pp_process_order', mappings: m(
    ['aufnr', 'process_order', 'string'], ['matnr', 'sku', 'long'], ['werks', 'plant', 'string'], ['arbpl', 'line_code', 'string'],
    ['gamng', 'planned_boxes', 'int'], ['wemng', 'delivered_boxes', 'int'], ['gstrs', 'planned_start', 'timestamp'], ['gltrs', 'planned_end', 'timestamp'],
    ['istart', 'actual_start', 'timestamp'], ['iend', 'actual_end', 'timestamp'], ['status', 'status', 'string'],
  ) },
  fact_fg_stock_daily: { sourceTable: 'mm_fg_stock_daily', mappings: m(
    ['budat', 'stock_date', 'date'], ['matnr', 'sku', 'long'], ['lgort', 'storage_location', 'string'], ['stock_box', 'stock_boxes', 'int'],
  ) },
  fact_maintenance_order: { sourceTable: 'pm_work_order', mappings: m(
    ['aufnr', 'work_order', 'string'], ['auart', 'order_type', 'string'], ['equnr', 'asset_code', 'string'], ['ktext', 'description', 'string'],
    ['erdat', 'created_on', 'date'], ['gstrp', 'start_ts', 'timestamp'], ['getri', 'end_ts', 'timestamp'],
    ['downtime_min', 'downtime_min', 'int'], ['cost_vnd', 'cost_vnd', 'long'],
  ) },
  fact_plan_header: { sourceTable: 'mes_plan_header', mappings: m(
    ['plan_id', 'plan_id', 'string'], ['plan_week', 'plan_week', 'string'], ['source', 'source', 'string'], ['created_by', 'created_by', 'string'],
    ['created_at', 'created_at', 'timestamp'], ['approved_by', 'approved_by', 'string'], ['approved_at', 'approved_at', 'timestamp'], ['effort_hours', 'effort_hours', 'double'],
  ) },
  fact_plan_slot: { sourceTable: 'mes_plan_slot', mappings: m(
    ['plan_id', 'plan_id', 'string'], ['line', 'line_code', 'string'], ['slot_no', 'slot_no', 'int'], ['start_ts', 'start_ts', 'timestamp'],
    ['end_ts', 'end_ts', 'timestamp'], ['matnr', 'sku', 'long'], ['plan_box', 'planned_boxes', 'int'], ['note', 'note', 'string'],
  ) },
  fact_production_hourly: { sourceTable: 'scada_counter_hourly', mappings: m(
    ['ts_hour', 'ts', 'timestamp'], ['line', 'line_code', 'string'], ['station', 'workcenter_code', 'string'], ['matnr', 'sku', 'long'],
    ['unit', 'unit', 'string'], ['rated_cpm', 'rated_cpm', 'int'], ['run_s', 'run_s', 'int'], ['stop_s', 'stop_s', 'int'],
    ['starved_s', 'starved_s', 'int'], ['blocked_s', 'blocked_s', 'int'], ['co_s', 'changeover_s', 'int'], ['planned_s', 'planned_s', 'int'],
    ['good_cnt', 'good_qty', 'long'], ['reject_cnt', 'reject_qty', 'long'], ['speed_avg', 'speed_avg', 'double'],
  ) },
  fact_stop_event: { sourceTable: 'scada_stop_event', dedupe: ['line', 'station', 'fault_code', 'ts_start'], mappings: m(
    ['evt_id', 'event_id', 'string'], ['line', 'line_code', 'string'], ['station', 'workcenter_code', 'string'], ['fault_code', 'fault_code', 'string'],
    ['ts_start', 'start_ts', 'timestamp'], ['ts_end', 'end_ts', 'timestamp'], ['dur_s', 'duration_s', 'int'], ['ack_by', 'ack_by', 'string'],
  ) },
  fact_checkweigher_shift: { sourceTable: 'scada_checkweigher_shift', mappings: m(
    ['shift_date', 'shift_date', 'date'], ['shift', 'shift_code', 'string'], ['line', 'line_code', 'string'], ['lane', 'lane', 'int'],
    ['matnr', 'sku', 'long'], ['n_samples', 'n_samples', 'long'], ['mean_g', 'mean_g', 'double'], ['sd_g', 'sd_g', 'double'],
    ['target_g', 'target_g', 'double'], ['under_rej', 'under_rejects', 'long'], ['over_rej', 'over_rejects', 'long'],
  ) },
  fact_material_shift: { sourceTable: 'scada_material_balance_shift', mappings: m(
    ['shift_date', 'shift_date', 'date'], ['shift', 'shift_code', 'string'], ['line', 'line_code', 'string'], ['matnr', 'sku', 'long'],
    ['powder_in_kg', 'powder_in_kg', 'double'], ['good_caps', 'good_caps', 'long'], ['reject_caps', 'reject_caps', 'long'],
    ['mean_fill_g', 'mean_fill_g', 'double'], ['target_g', 'target_g', 'double'], ['purge_kg', 'purge_kg', 'double'],
    ['cups_used', 'cups_used', 'long'], ['lids_used', 'lids_used', 'long'], ['cartons_used', 'cartons_used', 'long'],
  ) },
  fact_changeover: { sourceTable: 'mes_changeover_log', mappings: m(
    ['co_id', 'changeover_id', 'string'], ['line', 'line_code', 'string'], ['ts_start', 'start_ts', 'timestamp'], ['ts_end', 'end_ts', 'timestamp'],
    ['from_matnr', 'from_sku', 'long'], ['to_matnr', 'to_sku', 'long'], ['clean_type', 'cleaning', 'string'], ['purge_kg', 'purge_kg', 'double'],
  ) },
  fact_signal: { sourceTable: 'hist_tag_30m', mappings: m(
    ['ts', 'ts', 'timestamp'], ['tag', 'tag', 'string'], ['value', 'value', 'double'], ['quality', 'quality', 'string'], ['source', 'source', 'string'],
  ) },
});

/** Weather appends into `fact_signal` with the same five columns. */
export const WEATHER_APPEND = Object.freeze({
  sourceTable: 'weather_hourly',
  target: 'fact_signal',
  mappings: FACTS.fact_signal.mappings,
});

/**
 * The Excel operator log needs real cleaning, not just renaming: a dd/mm/yyyy
 * text date, "Shift 1" labels and empty strings where a field was left blank.
 */
export const OPERATOR_LOG_SQL = `
WITH s AS (SELECT * FROM input)
SELECT to_date(log_date, 'dd/MM/yyyy') AS shift_date,
       concat('SHIFT_', trim(substr(shift, 7))) AS shift_code,
       line AS line_code,
       employee_id AS operator_id,
       cast(good_boxes AS int) AS reported_good_boxes,
       cast(coffee_loss_kg AS double) AS reported_waste_kg,
       cast(reject_capsules AS int) AS reported_rejects,
       cast(stop_min AS int) AS reported_stop_min,
       nullif(trim(note), '') AS note
FROM s`;

/* ── Derived tables ─────────────────────────────────────────────────────── */

/**
 * Shift OEE per station. Availability against planned production time
 * (changeover is a loss, CIP/holidays/no-plan are not), performance against the
 * rated speed in the station's own unit, quality at the station. The additive
 * columns let a chart roll any window up with OEE_ROLLUP_SQL.
 */
export const OEE_SHIFT_SQL = `
WITH h AS (
  SELECT *,
         CASE WHEN hour(ts) < 6 THEN date_sub(to_date(ts), 1) ELSE to_date(ts) END AS shift_date,
         CASE WHEN hour(ts) >= 6 AND hour(ts) < 14 THEN 'SHIFT_1' WHEN hour(ts) >= 14 AND hour(ts) < 22 THEN 'SHIFT_2' ELSE 'SHIFT_3' END AS shift_code,
         rated_cpm * run_s / 60.0 / CASE unit WHEN 'BOX' THEN 16 WHEN 'PACK' THEN 48 ELSE 1 END AS rated_units
  FROM input
)
SELECT shift_date, shift_code, line_code, workcenter_code,
       sum(run_s) AS run_s, sum(stop_s) AS stop_s, sum(starved_s) AS starved_s, sum(blocked_s) AS blocked_s,
       sum(changeover_s) AS changeover_s, sum(planned_s) AS planned_s, sum(3600 - planned_s) AS available_s,
       sum(good_qty) AS good_qty, sum(reject_qty) AS reject_qty, sum(rated_units) AS rated_units,
       sum(run_s) / nullif(sum(3600 - planned_s), 0) AS availability,
       sum(good_qty + reject_qty) / nullif(sum(rated_units), 0) AS performance,
       sum(good_qty) / nullif(sum(good_qty + reject_qty), 0) AS quality,
       (sum(run_s) / nullif(sum(3600 - planned_s), 0)) * (sum(good_qty) / nullif(sum(rated_units), 0)) AS oee
FROM h
GROUP BY shift_date, shift_code, line_code, workcenter_code`;

/** Additive OEE over any set of `fact_oee_shift` rows. */
export const OEE_ROLLUP_SQL = `(sum(run_s) * 1.0 / nullif(sum(available_s), 0)) * (sum(good_qty) * 1.0 / nullif(sum(rated_units), 0))`;
/** Line-level OEE is read at the capsule inspection station, where rejects are counted. */
export const LINE_OEE_STATION = 'CAP_INSPECT';

const familyCase = (column) =>
  `CASE ${column} ${SKUS.map((sku) => `WHEN ${Number(sku.sku)} THEN '${sku.family}'`).join(' ')} END`;

/**
 * The one definition of material loss (UC1). Overfill ("giveaway") is powder
 * that went into good capsules above target — invisible to operators and to
 * the checkweigher, which is exactly why it never reaches the manual log.
 */
export const MATERIAL_BALANCE_SQL = `
WITH s AS (SELECT *, ${familyCase('sku')} AS family FROM input)
SELECT shift_date, shift_code, line_code, sku, family, powder_in_kg, good_caps, reject_caps, mean_fill_g, target_g, purge_kg,
       good_caps * target_g / 1000.0 AS theoretical_kg,
       good_caps * greatest(mean_fill_g - target_g, 0) / 1000.0 AS giveaway_kg,
       reject_caps * mean_fill_g / 1000.0 AS reject_kg,
       powder_in_kg - good_caps * greatest(mean_fill_g, target_g) / 1000.0 - reject_caps * mean_fill_g / 1000.0 - purge_kg AS unexplained_kg,
       powder_in_kg - good_caps * target_g / 1000.0 AS loss_kg,
       (good_caps * target_g / 1000.0) / nullif(powder_in_kg, 0) AS material_yield,
       CASE WHEN family = 'MILK' THEN 150000 ELSE 230000 END AS price_vnd_per_kg,
       (powder_in_kg - good_caps * target_g / 1000.0) * CASE WHEN family = 'MILK' THEN 150000 ELSE 230000 END AS loss_vnd,
       good_caps * greatest(mean_fill_g - target_g, 0) / 1000.0 * CASE WHEN family = 'MILK' THEN 150000 ELSE 230000 END AS giveaway_vnd
FROM s`;

/**
 * Rolling weekly forecast per SKU × market (UC2) — the JS `seasonalIndex` /
 * `forecastFrom` in Spark SQL. Seasonal index = ratio to a centred 53-week
 * average, averaged over years and k±1, normalised; level = mean of the last 8
 * deseasonalised weeks; growth = last 13 weeks vs the same 13 a year earlier,
 * clipped to [−20%, +40%]. Future rows: 13 weeks from the last complete week.
 * Backtest rows: the last 26 weeks re-forecast at leads 4 and 13, with the
 * actual beside them. P10/P90 from the CV of the lead-4 backtest.
 */
export const DEMAND_FORECAST_SQL = `
WITH w AS (
  SELECT sku, market, iso_week, week_start, cast(substr(iso_week, 5, 2) AS int) AS wk, cast(shipped_boxes AS double) AS y FROM input
),
idx AS (
  SELECT *, row_number() OVER (PARTITION BY sku, market ORDER BY week_start) - 1 AS i, count(*) OVER (PARTITION BY sku, market) AS n FROM w
),
cma AS (
  SELECT *,
         avg(y) OVER (PARTITION BY sku, market ORDER BY i ROWS BETWEEN 26 PRECEDING AND 26 FOLLOWING) AS cma,
         count(y) OVER (PARTITION BY sku, market ORDER BY i ROWS BETWEEN 26 PRECEDING AND 26 FOLLOWING) AS cnt
  FROM idx
),
ratio AS (SELECT sku, market, least(wk, 52) AS k, y / cma AS r FROM cma WHERE cnt = 53 AND cma > 0),
pairs AS (SELECT DISTINCT sku, market FROM w),
kgrid AS (SELECT sku, market, k FROM pairs LATERAL VIEW explode(sequence(1, 52)) g AS k),
raw AS (
  SELECT g.sku, g.market, g.k, coalesce(avg(r.r), 1.0) AS raw
  FROM kgrid g
  LEFT JOIN ratio r ON r.sku = g.sku AND r.market = g.market
   AND (r.k = g.k OR r.k = CASE WHEN g.k = 1 THEN 52 ELSE g.k - 1 END OR r.k = CASE WHEN g.k = 52 THEN 1 ELSE g.k + 1 END)
  GROUP BY g.sku, g.market, g.k
),
seas AS (SELECT sku, market, k, raw / avg(raw) OVER (PARTITION BY sku, market) AS s FROM raw),
ds AS (
  SELECT x.*, x.y / s.s AS d FROM idx x JOIN seas s ON s.sku = x.sku AND s.market = x.market AND s.k = least(x.wk, 52)
),
model AS (
  SELECT sku, market, i, n, wk, week_start, y,
         avg(d) OVER (PARTITION BY sku, market ORDER BY i ROWS BETWEEN 7 PRECEDING AND CURRENT ROW) AS lvl,
         sum(d) OVER (PARTITION BY sku, market ORDER BY i ROWS BETWEEN 12 PRECEDING AND CURRENT ROW) AS rec13,
         sum(d) OVER (PARTITION BY sku, market ORDER BY i ROWS BETWEEN 64 PRECEDING AND 52 PRECEDING) AS prior13
  FROM ds
),
grown AS (
  SELECT *, CASE WHEN prior13 > 0 THEN least(greatest(rec13 / prior13 - 1, -0.2), 0.4) ELSE 0.0 END AS g FROM model
),
fut0 AS (SELECT m.*, h FROM grown m LATERAL VIEW explode(sequence(1, ${DEMO.forecastHorizon})) f AS h WHERE m.i = m.n - 1),
future AS (
  SELECT f.sku, f.market, f.week_start AS origin_start, f.h AS lead, date_add(f.week_start, 7 * f.h) AS target_start,
         f.lvl * s.s * power(1 + f.g, f.h / 52.0) AS p50, CAST(NULL AS double) AS actual, false AS is_backtest
  FROM fut0 f JOIN seas s ON s.sku = f.sku AND s.market = f.market AND s.k = pmod(f.wk + f.h - 1, 52) + 1
),
bt0 AS (SELECT t.sku, t.market, t.i, t.y, t.week_start, l AS lead FROM ds t LATERAL VIEW explode(array(4, 13)) b AS l WHERE t.i >= t.n - 26),
bt AS (
  SELECT b.sku, b.market, o.week_start AS origin_start, b.lead, b.week_start AS target_start,
         o.lvl * s.s * power(1 + o.g, b.lead / 52.0) AS p50, b.y AS actual, true AS is_backtest
  FROM bt0 b
  JOIN grown o ON o.sku = b.sku AND o.market = b.market AND o.i = b.i - b.lead
  JOIN seas s ON s.sku = b.sku AND s.market = b.market AND s.k = pmod(o.wk + b.lead - 1, 52) + 1
),
cv AS (SELECT sku, market, stddev_samp(actual / p50 - 1) AS cv FROM bt WHERE lead = 4 GROUP BY sku, market),
unioned AS (SELECT * FROM future UNION ALL SELECT * FROM bt)
SELECT u.sku, u.market, u.origin_start, u.lead, u.target_start,
       concat(cast(year(date_add(u.target_start, 3)) AS string), lpad(cast(weekofyear(u.target_start) AS string), 2, '0')) AS iso_week,
       u.p50, u.p50 * (1 - 1.2816 * c.cv) AS p10, u.p50 * (1 + 1.2816 * c.cv) AS p90, u.actual, u.is_backtest
FROM unioned u JOIN cv c ON c.sku = u.sku AND c.market = u.market`;

/* Signal constants, generated from the reference. */
const healthMetrics = ASSETS.flatMap((asset) =>
  asset.metrics.filter((metric) => metric.alarm !== null).map((metric) => ({ ...metric, asset: asset.asset })),
);
const tagCase = (key) => `CASE tag ${healthMetrics.map((metric) => `WHEN '${metric.tag}' THEN ${typeof metric[key] === 'number' ? metric[key] : `'${metric[key]}'`}`).join(' ')} END`;
const DAY_S = 86_400;
const HALF_HOUR_S = 1_800;

/**
 * Asset health and remaining useful life (UC5), every 30 minutes, per asset —
 * its worst metric. Historian and MQTT values are first averaged into the same
 * 30-minute grain so a live stream does not outweigh the history.
 */
export const ASSET_HEALTH_SQL = `
WITH p AS (
  SELECT tag, cast(floor(unix_timestamp(ts) / ${HALF_HOUR_S}) * ${HALF_HOUR_S} AS bigint) AS e, avg(value) AS value
  FROM input
  WHERE source IN ('HISTORIAN', 'MQTT') AND tag IN (${healthMetrics.map((metric) => `'${metric.tag}'`).join(', ')})
  GROUP BY tag, cast(floor(unix_timestamp(ts) / ${HALF_HOUR_S}) * ${HALF_HOUR_S} AS bigint)
),
s AS (SELECT *, ${tagCase('asset')} AS asset_code, ${tagCase('alarm')} AS alarm FROM p),
w AS (
  SELECT *,
         avg(value) OVER (PARTITION BY tag ORDER BY e RANGE BETWEEN ${HEALTH.baselineFromDays * DAY_S} PRECEDING AND ${HEALTH.baselineToDays * DAY_S + HALF_HOUR_S} PRECEDING) AS mu,
         stddev_samp(value) OVER (PARTITION BY tag ORDER BY e RANGE BETWEEN ${HEALTH.baselineFromDays * DAY_S} PRECEDING AND ${HEALTH.baselineToDays * DAY_S + HALF_HOUR_S} PRECEDING) AS sigma,
         count(value) OVER (PARTITION BY tag ORDER BY e RANGE BETWEEN ${HEALTH.baselineFromDays * DAY_S} PRECEDING AND ${HEALTH.baselineToDays * DAY_S + HALF_HOUR_S} PRECEDING) AS base_n,
         avg(value) OVER (PARTITION BY tag ORDER BY e RANGE BETWEEN ${HEALTH.recentHours * 3600 - HALF_HOUR_S} PRECEDING AND CURRENT ROW) AS x6h,
         regr_slope(value, e / 86400.0) OVER (PARTITION BY tag ORDER BY e RANGE BETWEEN ${HEALTH.slopeHours * 3600 - HALF_HOUR_S} PRECEDING AND CURRENT ROW) AS slope
  FROM s
),
m AS (
  SELECT *, (x6h - mu) / nullif(sigma, 0) AS z, least(greatest((x6h - mu) / (alarm - mu), 0), 1) AS ratio FROM w WHERE base_n >= 10
),
h AS (
  SELECT *,
         100 - ${HEALTH.zWeight} * least(greatest((x6h - mu) / nullif(sigma, 0) / ${HEALTH.zScale}, 0), 1) - ${HEALTH.ratioWeight} * ratio AS health,
         CASE WHEN slope > 0 AND x6h < alarm THEN least(${HEALTH.rulCapDays}, (alarm - x6h) / slope) END AS rul_days
  FROM m
),
r AS (SELECT *, row_number() OVER (PARTITION BY asset_code, e ORDER BY health, tag) AS rn FROM h)
SELECT cast(from_unixtime(e) AS timestamp) AS ts, asset_code, tag AS worst_tag, value, x6h, mu, sigma, z, ratio, slope, rul_days, health,
       CASE WHEN health >= 75 THEN 'Normal' WHEN health >= 50 THEN 'Watch' WHEN health >= 30 THEN 'Warning' ELSE 'Critical' END AS band
FROM r WHERE rn = 1`;

/**
 * Humidity-stop risk per filling zone, hourly (UC4). Past hours are scored with
 * what was known 24 hours earlier (the "would we have known" backtest); future
 * hours use the weather forecast and the latest AHU / room readings.
 */
export const ROOM_RISK_SQL = `
WITH p AS (
  SELECT tag, cast(floor(unix_timestamp(ts) / ${HALF_HOUR_S}) * ${HALF_HOUR_S} AS bigint) AS e, avg(value) AS value
  FROM input
  WHERE source IN ('HISTORIAN', 'MQTT') AND tag IN ('FILL_Z1.RH', 'FILL_Z2.RH', 'FILL_Z1.TEMP', 'FILL_Z2.TEMP', 'AHU01.WHEEL_A', 'AHU02.WHEEL_A')
  GROUP BY tag, cast(floor(unix_timestamp(ts) / ${HALF_HOUR_S}) * ${HALF_HOUR_S} AS bigint)
),
z AS (
  SELECT CASE WHEN tag LIKE 'FILL_Z1%' OR tag LIKE 'AHU01%' THEN 'FILL_Z1' ELSE 'FILL_Z2' END AS room_code, e,
         max(CASE WHEN tag LIKE '%.RH' THEN value END) AS rh,
         max(CASE WHEN tag LIKE '%.TEMP' THEN value END) AS temp,
         max(CASE WHEN tag LIKE '%WHEEL_A' THEN value END) AS wheel
  FROM p
  GROUP BY CASE WHEN tag LIKE 'FILL_Z1%' OR tag LIKE 'AHU01%' THEN 'FILL_Z1' ELSE 'FILL_Z2' END, e
),
st AS (
  SELECT room_code, e,
         avg(wheel) OVER (PARTITION BY room_code ORDER BY e RANGE BETWEEN ${28 * DAY_S} PRECEDING AND ${2 * DAY_S + HALF_HOUR_S} PRECEDING) AS mu,
         avg(wheel) OVER (PARTITION BY room_code ORDER BY e RANGE BETWEEN ${DAY_S} PRECEDING AND CURRENT ROW) AS wheel24,
         avg(rh) OVER (PARTITION BY room_code ORDER BY e RANGE BETWEEN 7200 PRECEDING AND CURRENT ROW) AS rh2,
         avg(temp) OVER (PARTITION BY room_code ORDER BY e RANGE BETWEEN 7200 PRECEDING AND CURRENT ROW) AS temp2
  FROM z
),
last AS (SELECT max(e) AS last_e FROM st),
wx AS (
  SELECT cast(floor(unix_timestamp(ts) / 3600) * 3600 AS bigint) AS he, avg(value) AS dp
  FROM input WHERE tag = 'WX.DP' AND source IN ('WEATHER_OBS', 'WEATHER_FCST')
  GROUP BY cast(floor(unix_timestamp(ts) / 3600) * 3600 AS bigint)
),
rooms AS (SELECT DISTINCT room_code FROM st),
grid AS (
  SELECT r.room_code, x.he, x.dp, x.he > l.last_e AS is_forecast,
         CASE WHEN x.he > l.last_e THEN l.last_e ELSE x.he - ${DAY_S} END AS seen_e
  FROM wx x CROSS JOIN rooms r CROSS JOIN last l
  WHERE x.he >= l.last_e - ${60 * DAY_S}
),
j AS (
  SELECT g.room_code, g.he, g.dp, g.is_forecast, s.mu, s.wheel24, s.rh2, s.temp2
  FROM grid g JOIN st s ON s.room_code = g.room_code AND s.e = g.seen_e
),
f AS (
  SELECT room_code, CASE room_code WHEN 'FILL_Z1' THEN 'CAP_L1' ELSE 'CAP_L2' END AS line_code,
         cast(from_unixtime(he) AS timestamp) AS ts, is_forecast, dp, (wheel24 - mu) / mu AS ahu_dev, rh2 AS rh_now, temp2 AS temp_now,
         ${RISK.weights.dp} * least(greatest((dp - ${RISK.dpBase}) / ${RISK.dpSpan}, 0), 1)
         + ${RISK.weights.ahu} * least(greatest((wheel24 - mu) / mu / ${RISK.ahuSpan}, 0), 1)
         + ${RISK.weights.rh} * least(greatest((rh2 - ${RISK.rhBase}) / ${RISK.rhSpan}, 0), 1) AS risk
  FROM j
)
SELECT *, CASE WHEN risk >= 0.65 THEN 'HIGH' WHEN risk >= 0.4 THEN 'MEDIUM' ELSE 'LOW' END AS level FROM f`;

/* ── Lookup tables the plant model's live properties read ──────────────── */

export const DM_WORKCENTER_STATUS_SQL = `
WITH latest AS (SELECT max(ts) AS t FROM input),
h AS (SELECT i.* FROM input i JOIN latest l ON i.ts = l.t)
SELECT workcenter_code,
       CASE WHEN planned_s >= 3000 THEN 'planned' WHEN changeover_s >= 1200 THEN 'changeover' WHEN run_s >= 1800 THEN 'running' ELSE 'stopped' END AS status,
       concat(CASE WHEN planned_s >= 3000 THEN 'Planned stop' WHEN changeover_s >= 1200 THEN 'Recipe changeover' WHEN run_s >= 1800 THEN 'Running' ELSE 'Stopped' END,
              ' · ran ', cast(cast(round(100 * run_s / 3600.0) AS int) AS string), '% of the last hour') AS label
FROM h`;

const unsensored = ASSETS.filter((asset) => !asset.metrics.some((metric) => metric.alarm !== null)).map((asset) => [
  asset.asset,
  asset.asset.endsWith('_L1') ? 'No sensors – fit a current sensor (legacy line)' : 'Health not tracked (no alarm limit)',
]);

export const DM_ASSET_HEALTH_SQL = `
WITH r AS (SELECT *, row_number() OVER (PARTITION BY asset_code ORDER BY ts DESC) AS rn FROM input),
anchor AS (SELECT 1 AS one FROM input LIMIT 1),
bare AS (
  SELECT * FROM VALUES
${unsensored.map(([asset, label]) => `    ('${asset}', '${label}')`).join(',\n')}
    AS t(asset_code, label)
)
SELECT asset_code, round(health, 0) AS health,
       concat(cast(cast(round(health, 0) AS int) AS string), ' · ', band,
              CASE WHEN rul_days IS NOT NULL AND rul_days < 30 THEN concat(' · ~', cast(cast(round(rul_days, 0) AS int) AS string), ' days to alarm limit') ELSE '' END) AS label
FROM r WHERE rn = 1
UNION ALL
SELECT b.asset_code, CAST(NULL AS double) AS health, b.label
FROM bare b CROSS JOIN anchor`;

export const DM_ROOM_ENV_SQL = `
WITH first_future AS (
  SELECT *, row_number() OVER (PARTITION BY room_code ORDER BY ts) AS rn FROM input WHERE is_forecast
),
fut AS (
  SELECT room_code, max(risk) AS max_risk, min(CASE WHEN level = 'HIGH' THEN ts END) AS first_high
  FROM input WHERE is_forecast GROUP BY room_code
)
SELECT o.room_code, round(o.rh_now, 1) AS rh,
       concat(cast(round(o.rh_now, 1) AS string), '% RH · ', cast(round(o.temp_now, 1) AS string), ' °C · next 7 days: ',
              CASE WHEN f.max_risk >= 0.65 THEN concat('HIGH risk from ', date_format(f.first_high, 'dd/MM HH:mm'))
                   WHEN f.max_risk >= 0.4 THEN 'MEDIUM risk' ELSE 'LOW risk' END) AS label
FROM first_future o LEFT JOIN fut f ON f.room_code = o.room_code
WHERE o.rn = 1`;

/** Derived tables, in dependency order, with the curated table each reads. */
export const DERIVED = Object.freeze([
  { table: 'fact_oee_shift', from: 'fact_production_hourly', sql: OEE_SHIFT_SQL, label: 'Shift OEE' },
  { table: 'fact_material_balance_shift', from: 'fact_material_shift', sql: MATERIAL_BALANCE_SQL, label: 'Shift material balance' },
  { table: 'fact_demand_forecast', from: 'fact_shipment_weekly', sql: DEMAND_FORECAST_SQL, label: 'Rolling demand forecast' },
  { table: 'fact_asset_health', from: 'fact_signal', sql: ASSET_HEALTH_SQL, label: 'Asset health index' },
  { table: 'fact_room_risk', from: 'fact_signal', sql: ROOM_RISK_SQL, label: 'Filling-room humidity risk' },
  { table: 'dm_workcenter_status', from: 'fact_production_hourly', sql: DM_WORKCENTER_STATUS_SQL, label: 'Station status' },
  { table: 'dm_asset_health', from: 'fact_asset_health', sql: DM_ASSET_HEALTH_SQL, label: 'Latest asset health' },
  { table: 'dm_room_env', from: 'fact_room_risk', sql: DM_ROOM_ENV_SQL, label: 'Latest room environment' },
]);

/** Every curated table, in build order. */
export const BUILD_ORDER = Object.freeze([
  ...Object.keys(DIMENSIONS),
  ...Object.keys(FACTS),
  'fact_operator_log',
  ...DERIVED.map((item) => item.table),
]);

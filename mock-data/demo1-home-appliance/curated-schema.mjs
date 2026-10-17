/**
 * The curated warehouse contract for Demo Data 1 (Home Appliance).
 *
 * One definition of every column in `iceberg.demo1_home_appliance`, shared by the
 * Phase 5 pipelines that build the tables and the Phase 3 charts that read them.
 * A chart that invents a column name fails at seed time instead of rendering an
 * empty card on camera.
 *
 * Design rules this encodes, learned from the node catalog:
 *
 *  - **There is no JOIN node.** The transform catalog is CHANGE_SCHEMA,
 *    SELECT/DROP/RENAME_FIELD, FILTER, DROP_DUPLICATES, DROP_NULL_FIELDS,
 *    REMOVE_NULL_ROWS, FILL_MISSING_VALUES, AGGREGATE and MANUAL_SQL — and
 *    MANUAL_SQL exposes its single upstream input as the view `input`.
 *  - So **facts carry codes, not labels**, and the charts join the dimensions in
 *    Trino. That keeps every fact pipeline a straight SOURCE → CHANGE_SCHEMA →
 *    TARGET line, and keeps the generated SQL free of a hard-coded catalog name.
 *  - **OEE is computed once**, in `fact_oee_shift`, and every chart reads the
 *    column. Two OEE numbers that disagree on screen is the fastest way to lose
 *    a room of plant engineers.
 */

/** Spark's catalog name for Iceberg; the runtime preamble defaults to this. */
export const ICEBERG_CATALOG = process.env.ICEBERG_CATALOG ?? 'celesnity';
export const CURATED_DATABASE = 'demo1_home_appliance';
export const SOURCE_SCHEMA = 'demo1_home_appliance';

/** `[sourceField, targetField, sparkType]`, in output column order. */
const passthrough = (columns) => columns.map(([name, type]) => [name, name, type]);

/**
 * Dimensions. Their source columns are already canonical, so the CHANGE_SCHEMA
 * node here is pinning types rather than renaming — which is also why these are
 * the pipelines to run first and the least interesting to show.
 */
export const DIMENSIONS = Object.freeze({
  dim_product_model: passthrough([
    ['product_model', 'string'],
    ['product_name', 'string'],
    ['capacity_liters', 'int'],
    ['coil_material', 'string'],
    ['product_family', 'string'],
    ['line_code', 'string'],
    ['ex_factory_price_vnd', 'long'],
  ]),
  dim_line: passthrough([
    ['line_code', 'string'],
    ['line_name', 'string'],
    ['product_family', 'string'],
    ['takt_time_sec', 'int'],
    ['daily_capacity', 'int'],
    ['oee_target_pct', 'int'],
  ]),
  dim_workcenter: passthrough([
    ['workcenter_code', 'string'],
    ['short_name', 'string'],
    ['workcenter_name', 'string'],
    ['area_code', 'string'],
    ['sequence', 'int'],
  ]),
  dim_shift: passthrough([
    ['shift_code', 'string'],
    ['shift_name', 'string'],
    ['start_hour', 'int'],
    ['end_hour', 'int'],
  ]),
  dim_downtime_reason: passthrough([
    ['reason_code', 'string'],
    ['short_name', 'string'],
    ['reason_name', 'string'],
    ['category', 'string'],
  ]),
  dim_defect_code: passthrough([
    ['defect_code', 'string'],
    ['defect_name', 'string'],
    ['workcenter_code', 'string'],
    ['severity', 'string'],
  ]),
  dim_area: passthrough([
    ['area_code', 'string'],
    ['area_name', 'string'],
    ['base_load_kw', 'int'],
  ]),
});

/**
 * Facts built straight from the MES/ERP tables.
 *
 * `fact_production_hourly` is the one to open on camera: twelve raw MES source
 * columns mapped to canonical names and types in a single panel is the clearest
 * explanation of data mapping a non-technical audience will get.
 */
export const FACTS = Object.freeze({
  fact_production_hourly: {
    sourceTable: 'bronze_mes_production_log',
    mappings: [
      ['event_time', 'ts', 'timestamp'],
      ['line_code', 'line_code', 'string'],
      ['workcenter_code', 'workcenter_code', 'string'],
      ['model_code', 'product_model', 'string'],
      ['shift_code', 'shift', 'string'],
      ['planned_qty', 'planned_qty', 'int'],
      ['good_qty', 'good_qty', 'int'],
      ['scrap_qty', 'scrap_qty', 'int'],
      ['rework_qty', 'rework_qty', 'int'],
      ['run_min', 'runtime_min', 'int'],
      ['down_min', 'downtime_min', 'int'],
      ['starved_min', 'starved_min', 'int'],
    ],
  },
  fact_downtime_event: {
    sourceTable: 'bronze_downtime_event',
    mappings: [
      ['start_time', 'start_ts', 'timestamp'],
      ['end_time', 'end_ts', 'timestamp'],
      ['line_code', 'line_code', 'string'],
      ['workcenter_code', 'workcenter_code', 'string'],
      ['reason_code', 'reason_code', 'string'],
      ['duration_min', 'duration_min', 'int'],
      ['note', 'note', 'string'],
    ],
  },
  fact_quality_defect: {
    sourceTable: 'bronze_qc_inspection',
    mappings: [
      ['event_time', 'ts', 'timestamp'],
      ['line_code', 'line_code', 'string'],
      ['workcenter_code', 'workcenter_code', 'string'],
      ['model_code', 'product_model', 'string'],
      ['defect_code', 'defect_code', 'string'],
      ['quantity', 'qty', 'int'],
      ['severity', 'severity', 'string'],
    ],
  },
  fact_work_order: {
    sourceTable: 'bronze_erp_work_order',
    mappings: [
      ['order_no', 'work_order', 'string'],
      ['start_date', 'start_date', 'date'],
      ['end_date', 'end_date', 'date'],
      ['model_code', 'product_model', 'string'],
      ['line_code', 'line_code', 'string'],
      ['planned_qty', 'planned_qty', 'int'],
      ['completed_qty', 'completed_qty', 'int'],
      ['status', 'status', 'string'],
    ],
  },
  fact_energy_hourly: {
    sourceTable: 'bronze_energy',
    mappings: [
      ['event_time', 'ts', 'timestamp'],
      ['area_code', 'area_code', 'string'],
      ['kwh', 'kwh', 'decimal(10,2)'],
      ['peak_kw', 'kw_peak', 'decimal(10,2)'],
      ['power_factor', 'power_factor', 'decimal(4,2)'],
      ['ambient_temp_c', 'ambient_c', 'decimal(4,1)'],
    ],
  },
  fact_inventory_fg: {
    sourceTable: 'bronze_fg_inventory',
    mappings: [
      ['stock_date', 'snapshot_date', 'date'],
      ['warehouse_code', 'warehouse_code', 'string'],
      ['model_code', 'product_model', 'string'],
      ['opening_qty', 'opening_qty', 'int'],
      ['received_qty', 'received_qty', 'int'],
      ['issued_qty', 'issued_qty', 'int'],
      ['closing_qty', 'closing_qty', 'int'],
    ],
  },
  fact_shipment_export: {
    sourceTable: 'bronze_export_shipment',
    mappings: [
      ['ship_date', 'ship_date', 'date'],
      ['market', 'destination_market', 'string'],
      ['container_no', 'container_no', 'string'],
      ['port', 'port', 'string'],
      ['model_code', 'product_model', 'string'],
      ['quantity', 'qty', 'int'],
      ['committed_date', 'committed_date', 'date'],
      ['actual_delivery_date', 'delivered_date', 'date'],
    ],
  },
});

/**
 * Shift-grain OEE, derived from `fact_production_hourly` rather than from the
 * source again, so there is exactly one place the formula lives.
 *
 * Every projection stays on one line on purpose. Core's MANUAL_SQL analyzer
 * matches `AS <alias>` with a regex that does not span newlines, so an
 * expression wrapped before its alias makes the alias itself look like a column
 * reference — and validation then rejects the node for reading a field the
 * upstream table does not have.
 *
 * `paced_qty` is the plan for the minutes each station actually ran, summed at
 * the *hourly* grain. It exists so a dashboard can re-aggregate this table to a
 * week or a month and still get the right answer: multiplying an already-summed
 * `planned_qty` by an already-summed `runtime_min` does not give back the same
 * number, and an OEE that changes when you widen the date filter is worse than
 * no OEE at all.
 *
 * `performance` divides good output by the plan for the minutes the station
 * actually had material, so scrap is already excluded from it. `quality` is
 * carried alongside for reporting and deliberately NOT multiplied back in —
 * doing so would count the same loss twice. `starved_min` sits outside both:
 * a station starved by a stoppage upstream is not the station with the problem.
 */
export const OEE_SHIFT_SQL = `
SELECT
  to_date(ts)                                     AS shift_date,
  shift,
  line_code,
  workcenter_code,
  sum(planned_qty)                                AS planned_qty,
  sum(good_qty)                                   AS good_qty,
  sum(scrap_qty)                                  AS scrap_qty,
  sum(rework_qty)                                 AS rework_qty,
  sum(runtime_min)                                AS runtime_min,
  sum(downtime_min)                               AS downtime_min,
  sum(starved_min)                                AS starved_min,
  sum(planned_qty * runtime_min / 60.0)           AS paced_qty,
  sum(runtime_min) / nullif(sum(runtime_min + downtime_min), 0)          AS availability,
  sum(good_qty)    / nullif(sum(planned_qty * runtime_min / 60.0), 0)    AS performance,
  sum(good_qty)    / nullif(sum(good_qty + scrap_qty + rework_qty), 0)   AS quality,
  (sum(runtime_min) / nullif(sum(runtime_min + downtime_min), 0)) * (sum(good_qty) / nullif(sum(planned_qty * runtime_min / 60.0), 0)) AS oee
FROM input
GROUP BY to_date(ts), shift, line_code, workcenter_code`;

/**
 * How a chart rolls `fact_oee_shift` up to any window. Additive sums only, so a
 * day, a week and a quarter all give the same answer for the same rows.
 */
export const OEE_ROLLUP_SQL = `(sum(runtime_min) * 1.0 / nullif(sum(runtime_min + downtime_min), 0))
    * (sum(good_qty) * 1.0 / nullif(sum(paced_qty), 0))`;

/** Equipment-to-station map for the plant model's live OEE property. */
export const EQUIPMENT_STATIONS = Object.freeze([
  ['PRESS_400T_01', 'CUT_PRESS'],
  ['PRESS_400T_02', 'CUT_PRESS'],
  ['BEND_CNC_01', 'CAB_FORM'],
  ['COILWIND_01', 'COIL_WIND'],
  ['COILWIND_02', 'COIL_WIND'],
  ['FOAM_CANNON_01', 'PU_FOAM'],
  ['FOAM_CANNON_02', 'PU_FOAM'],
  ['VACPUMP_03', 'VAC_CHG'],
  ['GASFILL_R600A_01', 'VAC_CHG'],
  ['HE_SNIFFER_01', 'LEAK_TEST'],
  ['PULLDOWN_CH_01', 'HIPOT_RUN'],
  ['CONV_PACK_01', 'PACK'],
]);

/**
 * The two lookup tables the plant model's `catalog-scalar` properties read at
 * render time.
 *
 * The status table is three constant rows, but it still has to read from
 * `input`: Core rejects a MANUAL_SQL node whose query does not reference that
 * view, so the anchor CTE is load-bearing rather than decorative. It is written
 * as a CTE rather than a subquery because Core's static analyzer matches the
 * first `FROM input` it finds — inside a subquery that leaves the rest of the
 * statement looking like a list of unknown column references. Both are derived from `fact_oee_shift` so a node card moves when
 * the warehouse does — which is the whole point of showing them on camera.
 */
export const DM_WORKCENTER_STATUS_SQL = `
WITH anchor AS (SELECT 1 AS one FROM input LIMIT 1),
codes AS (
  SELECT 1 AS status_id, 'running' AS status, 'Running' AS label
  UNION ALL SELECT 2, 'maintenance', 'Maintenance'
  UNION ALL SELECT 3, 'stopped', 'Stopped'
)
SELECT c.status_id, c.status, c.label
FROM codes c CROSS JOIN anchor`;

export const DM_EQUIPMENT_OEE_SQL = `
WITH latest AS (
  SELECT workcenter_code, oee,
         row_number() OVER (PARTITION BY workcenter_code ORDER BY shift_date DESC, shift DESC) AS rn
  FROM input
  WHERE line_code = 'LINE_FRZ_1'
),
stations AS (
  SELECT * FROM VALUES
${EQUIPMENT_STATIONS.map(([equipment, station]) => `    ('${equipment}', '${station}')`).join(',\n')}
    AS t(equipment_code, workcenter_code)
)
SELECT s.equipment_code,
       round(l.oee, 3) AS oee,
       concat(cast(round(l.oee * 100) AS int), '%') AS label
FROM stations s
JOIN latest l ON l.workcenter_code = s.workcenter_code AND l.rn = 1`;

/** Every curated table, in the order its pipeline has to run. */
export const BUILD_ORDER = Object.freeze([
  ...Object.keys(DIMENSIONS),
  ...Object.keys(FACTS),
  'fact_oee_shift',
  'dm_workcenter_status',
  'dm_equipment_oee',
]);

/** Column names a chart may reference, for Phase 3's own validation. */
export function curatedColumns(table) {
  if (table in DIMENSIONS) return DIMENSIONS[table].map(([, target]) => target);
  if (table in FACTS) return FACTS[table].mappings.map(([, target]) => target);
  const derived = {
    fact_oee_shift: [
      'shift_date',
      'shift',
      'line_code',
      'workcenter_code',
      'planned_qty',
      'good_qty',
      'scrap_qty',
      'rework_qty',
      'runtime_min',
      'downtime_min',
      'starved_min',
      'paced_qty',
      'availability',
      'performance',
      'quality',
      'oee',
    ],
    dm_workcenter_status: ['status_id', 'status', 'label'],
    dm_equipment_oee: ['equipment_code', 'oee', 'label'],
    fact_sensor_reading: ['ts', 'equipment_code', 'metric', 'value', 'unit', 'status'],
  };
  return derived[table];
}

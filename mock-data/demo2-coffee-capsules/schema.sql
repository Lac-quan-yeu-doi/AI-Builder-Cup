-- Demo Data 2 (coffee capsules): source systems of a coffee-capsule filling &
-- packing plant — mock data only.
--
-- SAP-style (IBP / SD / MM / PP / PM), SCADA, historian (PI-style tag/value),
-- weather and a digitised Excel operator log. Several column names are the
-- source systems' own SAP abbreviations (AUFNR, MATNR, GAMNG …).
DROP SCHEMA IF EXISTS demo2_coffee_capsules CASCADE;
CREATE SCHEMA demo2_coffee_capsules;
CREATE TABLE demo2_coffee_capsules.md_material (
  matnr text,
  short_code text,
  product_name text,
  family text,
  contains_milk boolean,
  capsules_per_box integer,
  target_fill_g numeric(14,4),
  tolerance_g numeric(14,4),
  rh_max_pct integer,
  eligible_lines text,
  auger_profile text,
  demand_share numeric(14,4)
);

CREATE TABLE demo2_coffee_capsules.md_family (
  family text,
  name text,
  contains_milk boolean,
  seq integer
);

CREATE TABLE demo2_coffee_capsules.md_material_cost (
  cost_code text,
  name text,
  uom text,
  price_vnd integer
);

CREATE TABLE demo2_coffee_capsules.md_line (
  line text,
  name text,
  year_commissioned integer,
  rate_rg_cpm integer,
  rate_milk_cpm integer,
  lanes integer,
  has_iot boolean,
  oee_target integer,
  zone text
);

CREATE TABLE demo2_coffee_capsules.md_workcenter (
  workcenter text,
  line text,
  station text,
  name text,
  short_name text,
  room text,
  seq integer
);

CREATE TABLE demo2_coffee_capsules.md_asset (
  asset text,
  name text,
  kind text,
  workcenter text,
  signals text,
  pm_days integer,
  year integer
);

CREATE TABLE demo2_coffee_capsules.md_fault_code (
  fault_code text,
  name text,
  short_name text,
  category text,
  station text
);

CREATE TABLE demo2_coffee_capsules.md_reject_code (
  reject_code text,
  name text,
  station text,
  unit text
);

CREATE TABLE demo2_coffee_capsules.md_changeover_matrix (
  from_family text,
  to_family text,
  minutes integer,
  purge_kg integer,
  cleaning text
);

CREATE TABLE demo2_coffee_capsules.md_shift (
  shift text,
  name text,
  start_hour integer,
  end_hour integer
);

CREATE TABLE demo2_coffee_capsules.md_market (
  market text,
  name text,
  is_export boolean
);

CREATE TABLE demo2_coffee_capsules.md_room (
  room text,
  name text,
  line text,
  ahu text,
  temp_target_c integer,
  rh_max_pct integer,
  rh_alarm_pct integer,
  rh_stop_pct integer
);

CREATE TABLE demo2_coffee_capsules.ibp_shipment_history (
  calweek text,
  week_start date,
  matnr text,
  market text,
  ship_box integer,
  ship_pack integer
);

CREATE TABLE demo2_coffee_capsules.ibp_demand_plan (
  plan_vers text,
  created_on date,
  calweek text,
  week_start date,
  matnr text,
  market text,
  plan_box integer
);

CREATE TABLE demo2_coffee_capsules.sd_open_orders (
  vbeln text,
  posnr integer,
  matnr text,
  market text,
  req_week text,
  order_box integer,
  status text
);

CREATE TABLE demo2_coffee_capsules.pp_process_order (
  aufnr text,
  matnr text,
  werks text,
  arbpl text,
  gamng integer,
  wemng integer,
  gstrs timestamp,
  gltrs timestamp,
  istart timestamp,
  iend timestamp,
  status text
);

CREATE TABLE demo2_coffee_capsules.mm_fg_stock_daily (
  budat date,
  matnr text,
  lgort text,
  stock_box integer
);

CREATE TABLE demo2_coffee_capsules.pm_work_order (
  aufnr text,
  auart text,
  equnr text,
  ktext text,
  erdat date,
  gstrp timestamp,
  getri timestamp,
  downtime_min integer,
  cost_vnd integer
);

CREATE TABLE demo2_coffee_capsules.mes_plan_header (
  plan_id text,
  plan_week text,
  source text,
  created_by text,
  created_at timestamp,
  approved_by text,
  approved_at timestamp,
  effort_hours numeric(14,4)
);

CREATE TABLE demo2_coffee_capsules.mes_plan_slot (
  plan_id text,
  line text,
  slot_no integer,
  start_ts timestamp,
  end_ts timestamp,
  matnr text,
  plan_box integer,
  note text
);

CREATE TABLE demo2_coffee_capsules.scada_counter_hourly (
  ts_hour timestamp,
  line text,
  station text,
  matnr text,
  unit text,
  rated_cpm integer,
  run_s integer,
  stop_s integer,
  starved_s integer,
  blocked_s integer,
  co_s integer,
  planned_s integer,
  good_cnt integer,
  reject_cnt integer,
  speed_avg numeric(14,4)
);

CREATE TABLE demo2_coffee_capsules.scada_stop_event (
  evt_id text,
  line text,
  station text,
  fault_code text,
  ts_start timestamp,
  ts_end timestamp,
  dur_s integer,
  ack_by text
);

CREATE TABLE demo2_coffee_capsules.scada_checkweigher_shift (
  shift_date date,
  shift text,
  line text,
  lane integer,
  matnr text,
  n_samples integer,
  mean_g numeric(14,4),
  sd_g numeric(14,4),
  target_g numeric(14,4),
  under_rej integer,
  over_rej integer
);

CREATE TABLE demo2_coffee_capsules.scada_material_balance_shift (
  shift_date date,
  shift text,
  line text,
  matnr text,
  powder_in_kg numeric(14,4),
  good_caps integer,
  reject_caps integer,
  mean_fill_g numeric(14,4),
  target_g numeric(14,4),
  purge_kg numeric(14,4),
  cups_used integer,
  lids_used integer,
  cartons_used integer
);

CREATE TABLE demo2_coffee_capsules.mes_changeover_log (
  co_id text,
  line text,
  ts_start timestamp,
  ts_end timestamp,
  from_matnr text,
  to_matnr text,
  clean_type text,
  purge_kg numeric(14,4)
);

CREATE TABLE demo2_coffee_capsules.operator_shift_log (
  log_date text,
  shift text,
  line text,
  employee_id text,
  good_boxes integer,
  coffee_loss_kg numeric(14,4),
  reject_capsules integer,
  stop_min integer,
  note text
);

CREATE TABLE demo2_coffee_capsules.hist_tag_30m (
  ts timestamp,
  tag text,
  value numeric(14,4),
  quality text,
  source text
);

CREATE TABLE demo2_coffee_capsules.hist_tag_dictionary (
  tag text,
  asset text,
  metric text,
  unit text,
  hi_alarm numeric(14,4)
);

CREATE TABLE demo2_coffee_capsules.weather_hourly (
  ts timestamp,
  tag text,
  value numeric(14,4),
  quality text,
  source text,
  issued_at timestamp
);



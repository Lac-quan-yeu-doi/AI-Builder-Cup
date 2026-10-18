-- Demo Data 1 (home appliance — chest freezers): a plant MES/ERP source system
-- as the platform finds it. Mixed grains, no surrogate keys, no constraints
-- between fact and dimension tables. Mock data only.
DROP SCHEMA IF EXISTS demo1_home_appliance CASCADE;
CREATE SCHEMA demo1_home_appliance;

CREATE TABLE demo1_home_appliance.dim_product_model (
  product_model        varchar(40) PRIMARY KEY,
  product_name         varchar(160) NOT NULL,
  capacity_liters      integer NOT NULL,
  coil_material        varchar(20) NOT NULL,
  product_family       varchar(60) NOT NULL,
  line_code            varchar(40) NOT NULL,
  ex_factory_price_vnd bigint NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_line (
  line_code      varchar(40) PRIMARY KEY,
  line_name      varchar(160) NOT NULL,
  product_family varchar(60) NOT NULL,
  takt_time_sec  integer NOT NULL,
  daily_capacity integer NOT NULL,
  oee_target_pct integer NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_workcenter (
  workcenter_code varchar(40) PRIMARY KEY,
  short_name      varchar(40) NOT NULL,
  workcenter_name varchar(160) NOT NULL,
  area_code       varchar(40) NOT NULL,
  sequence        integer NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_shift (
  shift_code varchar(20) PRIMARY KEY,
  shift_name varchar(60) NOT NULL,
  start_hour integer NOT NULL,
  end_hour   integer NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_downtime_reason (
  reason_code varchar(40) PRIMARY KEY,
  short_name  varchar(40) NOT NULL,
  reason_name varchar(160) NOT NULL,
  category    varchar(60) NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_defect_code (
  defect_code     varchar(40) PRIMARY KEY,
  defect_name     varchar(160) NOT NULL,
  workcenter_code varchar(40) NOT NULL,
  severity        varchar(40) NOT NULL
);

CREATE TABLE demo1_home_appliance.dim_area (
  area_code    varchar(40) PRIMARY KEY,
  area_name    varchar(160) NOT NULL,
  base_load_kw integer NOT NULL
);

-- One row per production hour, per line, per work center.
CREATE TABLE demo1_home_appliance.bronze_mes_production_log (
  event_time      timestamp NOT NULL,
  line_code       varchar(40) NOT NULL,
  workcenter_code varchar(40) NOT NULL,
  model_code      varchar(40) NOT NULL,
  shift_code      varchar(20) NOT NULL,
  planned_qty     integer NOT NULL,
  good_qty        integer NOT NULL,
  scrap_qty       integer NOT NULL,
  rework_qty      integer NOT NULL,
  run_min         integer NOT NULL,
  down_min        integer NOT NULL,
  starved_min     integer NOT NULL
);

CREATE TABLE demo1_home_appliance.bronze_downtime_event (
  start_time      timestamp NOT NULL,
  end_time        timestamp NOT NULL,
  line_code       varchar(40) NOT NULL,
  workcenter_code varchar(40) NOT NULL,
  reason_code     varchar(40) NOT NULL,
  duration_min    integer NOT NULL,
  note            varchar(400)
);

CREATE TABLE demo1_home_appliance.bronze_qc_inspection (
  event_time      timestamp NOT NULL,
  line_code       varchar(40) NOT NULL,
  workcenter_code varchar(40) NOT NULL,
  model_code      varchar(40) NOT NULL,
  defect_code     varchar(40) NOT NULL,
  quantity        integer NOT NULL,
  severity        varchar(40) NOT NULL
);

CREATE TABLE demo1_home_appliance.bronze_erp_work_order (
  order_no      varchar(40) PRIMARY KEY,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  model_code    varchar(40) NOT NULL,
  line_code     varchar(40) NOT NULL,
  planned_qty   integer NOT NULL,
  completed_qty integer NOT NULL,
  status        varchar(30) NOT NULL
);

CREATE TABLE demo1_home_appliance.bronze_energy (
  event_time     timestamp NOT NULL,
  area_code      varchar(40) NOT NULL,
  kwh            numeric(10, 2) NOT NULL,
  peak_kw        numeric(10, 2) NOT NULL,
  power_factor   numeric(4, 2) NOT NULL,
  ambient_temp_c numeric(4, 1) NOT NULL
);

CREATE TABLE demo1_home_appliance.bronze_fg_inventory (
  stock_date     date NOT NULL,
  warehouse_code varchar(40) NOT NULL,
  model_code     varchar(40) NOT NULL,
  opening_qty    integer NOT NULL,
  received_qty   integer NOT NULL,
  issued_qty     integer NOT NULL,
  closing_qty    integer NOT NULL
);

CREATE TABLE demo1_home_appliance.bronze_export_shipment (
  ship_date            date NOT NULL,
  market               varchar(60) NOT NULL,
  container_no         varchar(40) NOT NULL,
  port                 varchar(60) NOT NULL,
  model_code           varchar(40) NOT NULL,
  quantity             integer NOT NULL,
  committed_date       date NOT NULL,
  actual_delivery_date date NOT NULL
);

-- Created after the data is loaded (faster than maintaining them during COPY).
CREATE INDEX ON demo1_home_appliance.bronze_mes_production_log (event_time);
CREATE INDEX ON demo1_home_appliance.bronze_mes_production_log (workcenter_code, event_time);
CREATE INDEX ON demo1_home_appliance.bronze_downtime_event (start_time);
CREATE INDEX ON demo1_home_appliance.bronze_qc_inspection (event_time);
CREATE INDEX ON demo1_home_appliance.bronze_energy (event_time);
CREATE INDEX ON demo1_home_appliance.bronze_fg_inventory (stock_date);
CREATE INDEX ON demo1_home_appliance.bronze_export_shipment (ship_date);

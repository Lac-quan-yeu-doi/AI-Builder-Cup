-- Created after the data is loaded (faster than maintaining them during COPY).
CREATE INDEX ON demo2_coffee_capsules.scada_counter_hourly (ts_hour);
CREATE INDEX ON demo2_coffee_capsules.scada_counter_hourly (line, station, ts_hour);
CREATE INDEX ON demo2_coffee_capsules.scada_stop_event (ts_start);
CREATE INDEX ON demo2_coffee_capsules.hist_tag_30m (tag, ts);
CREATE INDEX ON demo2_coffee_capsules.weather_hourly (ts);
CREATE INDEX ON demo2_coffee_capsules.ibp_shipment_history (week_start);

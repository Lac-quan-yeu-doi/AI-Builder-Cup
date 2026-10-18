# Mock source data

Two deterministic mock datasets, each standing in for a plant's MES/ERP source
systems. They are committed as Postgres dumps and loaded automatically by the
`sample-postgres` service in `docker-compose.yaml`, so no external database is
needed. The curated Iceberg warehouses built from them are committed too, and
loaded by `trino-seed` (see [Built in](#built-in-the-curated-warehouses)). All
data is mock data.

| Dataset | Postgres schema | Plant | Window |
|---|---|---|---|
| Demo Data 1 (home appliance) | `demo1_home_appliance` | Chest-freezer assembly: 3 lines, 13 work centers | 120 days, 2026-06-12 → 2026-10-09 |
| Demo Data 2 (coffee capsules) | `demo2_coffee_capsules` | Coffee-capsule filling & packing: 2 lines × 11 stations, historian, weather | 120 days, 2026-06-12 → 2026-10-09 |

## Use it

```bash
docker compose up -d sample-postgres
```

The dumps in `init/` run the first time the `sample_postgres_data` volume is
created, which takes about a minute. To connect:

| From | Host | Port | Database | User / password |
|---|---|---|---|---|
| Your machine | `127.0.0.1` | `15433` | `sample` | `sample` / `sample_dev_password` |
| Core (compose network) | `sample-postgres` | `5432` | `sample` | `sample` / `sample_dev_password` |

`sample-postgres` is already in Core's `CONNECTION_ALLOWED_HOSTS`, so you can add
it as a database connection in the web app and crawl either schema.

## Built in: the curated warehouses

The tables the data-platform seeds build — `iceberg.demo1_home_appliance` and
`iceberg.demo2_coffee_capsules` — are committed as
`trino/seed/demo1-home-appliance.sql.zip` and
`trino/seed/demo2-coffee-capsules.sql.zip`. The compose `trino-seed` job loads
them next to the generic `iceberg.demo` sample, and Core lets every
organization read all three without a grant. So on a fresh stack (a new
server, or after `docker compose down -v`) both warehouses can be browsed,
queried and asked about right after `docker compose up`, with no crawler,
pipeline or Spark run.

- The first `up` of a fresh stack spends a few minutes loading them; later runs
  see they are loaded and skip them. A stack that built them with the seed
  scripts keeps its own tables.
- They hold data only. The plant sites, charts, dashboards, agent prompts and
  automations still come from the seed scripts below.

## Build the full demos in the app

The source data alone is just two Postgres schemas. The seed scripts build each
demo inside Celesnity: a published plant model, the data platform (Iceberg
database, source connection, crawler, mapping and derived pipelines), charts,
dashboards, the agents' plant context, and for Demo Data 2 the automations,
scripted chat and MQTT streaming. Run them against the local stack, from the
repository root:

```bash
docker compose up -d --build --wait
```

```bash
bash mock-data/bootstrap-local-org.sh
```

```bash
npm --prefix mock-data install
```

```bash
node mock-data/setup-workspace.mjs
```

Then each demo's `seed/` scripts in number order (there is no step 02: the
source data is already in `sample-postgres`):

| Demo Data 1 (`demo1-home-appliance/seed/`) | Demo Data 2 (`demo2-coffee-capsules/seed/`) |
|---|---|
| 01 plant site · 05 data platform · 03 charts · 04 dashboards · 06 agents · 07 scripted chat | 01 · 03 data platform · 04 charts · 05 dashboards · 06 agents · 07 automations · 08 scripted chat · 09 streaming |

Demo Data 1 runs 05 before 03 because the charts read tables the pipelines
build. Both step-06 scripts apply the same combined prompt for the two plants
(`lib/agent-context.mjs`). Demo Data 2's details are in
[demo2-coffee-capsules/SEED.md](demo2-coffee-capsules/SEED.md). Step 09 and Demo
Data 1's sensor chart need the `streaming` compose profile:

```bash
SPARK_WORKER_REPLICAS=2 docker compose --profile streaming up -d
```

Defaults target the local stack (`lib/http.mjs`); set `CELESNITY_CORE_URL`
and `CELESNITY_ACCESS_TOKEN` to seed another environment.

Verified so far on a local stack: Demo Data 1 steps 01, 03, 04, 05 and 06, and
Demo Data 2 steps 01 and 03. The other steps passed their offline checks but
have not been run end to end yet.

## Tables

**Demo Data 1** — `dim_product_model`, `dim_line`, `dim_workcenter`, `dim_shift`,
`dim_downtime_reason`, `dim_defect_code`, `dim_area`; hourly
`bronze_mes_production_log`, plus `bronze_downtime_event`,
`bronze_qc_inspection`, `bronze_erp_work_order`, `bronze_energy`,
`bronze_fg_inventory` and `bronze_export_shipment`.

**Demo Data 2** — master data `md_*`; SAP-style planning and orders
(`ibp_*`, `sd_open_orders`, `pp_process_order`, `mm_fg_stock_daily`,
`pm_work_order`); weekly plans (`mes_plan_header`, `mes_plan_slot`, including one
plan made by the scheduler); SCADA (`scada_*`), `mes_changeover_log`, the
digitised `operator_shift_log`, historian `hist_tag_30m` / `hist_tag_dictionary`
and `weather_hourly`. Some columns keep their SAP field names (`aufnr`, `matnr`,
`budat` …) on purpose, as a real extract would.

## Planted stories

The generators assert these on every build, so the data always contains them.

**Demo Data 1**
- A: PU foam on `LINE_FRZ_1` degrades over the last 12 days (`DT_FOAM_MOLD`).
  Its OEE drops from 0.85 to 0.67, and output falls line-wide (about 865 units lost).
- B: model `FZ-S245-CU` leaks R600a at `LEAK_TEST` for 8 days. The root cause
  shows up upstream at `COIL_WIND` as bad coil solder.
- C: energy per unit rises with ambient temperature.
- D: export on-time delivery to North America falls to 0.85 in the last month.

**Demo Data 2**
- S1: overfill on `CAP_L1` after an auger-profile change 21 days before the end.
- S2: the manual operator log is often blank and under-reports losses, worst
  on Shift 3.
- S3: lid seal heater B on `CAP_L2` wears, then fails for 192 minutes.
- S4: dosing auger wear on `CAP_L2` over the last 9 days (health band `Warning`).
- S5: demand uplift in PH/TH for two SKUs outgrows the semi-annual plan
  (plan WAPE 0.15 vs 0.07 for a rolling 4-week forecast).
- S6: AHU-02 humidity stop (`E001`), with HIGH risk windows forecast for next week.

## Rebuild the dumps

After editing a generator, reference file or schema:

```bash
node mock-data/build-dumps.mjs
docker compose rm -sf sample-postgres
docker volume rm minder-sys_sample_postgres_data
docker compose up -d sample-postgres
```

This needs Node 20+ and `python3`, and no npm packages. The end date is pinned
(`--end-date`, default `2026-10-09`), so a rebuild is byte-identical. The stories
are tuned against that date. If you move it, the build fails when a story drops
out; try a nearby date.

## Rebuild the Trino fixtures

After the source data or a pipeline changes, rebuild the warehouses on a local
stack with the data-platform seeds (Demo Data 1 step 05, Demo Data 2 step 03),
then export them. Trino is not published on the host, so the export runs on the
compose network:

```bash
docker compose run --rm --no-deps -v "$PWD":/work -w /work --entrypoint node celesnity-api mock-data/build-trino-seed.mjs
```

`--only demo1` or `--only demo2` exports one. Each zip holds SQL files of at
most 2 MB, because the Trino CLI in `trino-seed` holds a whole file in memory.
A stack that already has the tables skips the load, so to reload a changed
fixture there, drop the schema's tables first or start from
`docker compose down -v`.

## Layout

```
mock-data/
  build-dumps.mjs            generator → schema + COPY → init/*.sql.gz
  build-trino-seed.mjs       built Iceberg tables → ../trino/seed/*.sql.zip
  init/                      committed dumps, mounted into sample-postgres
  lib/                       shared HTTP helpers and the combined agent prompt
  bootstrap-local-org.sh     creates the local organization (once per volume)
  setup-workspace.mjs        catalog grants for service identities + agent manifests
  demo1-home-appliance/      reference.mjs, generate.mjs, schema.sql, curated-schema.mjs,
                             charts.mjs, dashboards.mjs, agent-context.mjs, seed/
  demo2-coffee-capsules/     same, plus scheduler/scheduler.py, replay_publisher.py, SEED.md
```

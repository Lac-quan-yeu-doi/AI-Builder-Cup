---
name: demo2-weekly-scheduling
description: Use when asked to plan, re-plan or explain the weekly production schedule (timetable) for the Demo Data 2 coffee-capsule lines CAP_L1 and CAP_L2, including moving milk recipes away from humidity-risk windows or reserving maintenance windows.
namespace: demo2
display:
  en:
    title: "Demo Data 2 – weekly production schedule"
    description: "Plan or explain the weekly coffee-capsule line schedule."
    details: "Builds the CAP_L1/CAP_L2 weekly timetable, moving milk recipes out of humidity-risk windows and reserving maintenance windows."
---

# Weekly production schedule — Demo Data 2 (coffee capsules)

The schedule is produced by a **deterministic scheduler** (`scheduler.py`, in this skill's
sandbox resources). Never invent a timetable yourself: gather the inputs, run the scheduler,
then explain and adjust. Answer the user in English.

Data lives in Trino catalog `iceberg`, schema `demo2_coffee_capsules` (all mock data).

## 1. Gather inputs with `run_query`

Target week = `max(week_start)` in `fact_shipment_weekly` (the last complete week) + 14 days,
i.e. the week starting on the Monday after the current production week, unless the user names
one. Monday 06:00 is the week start; the horizon is 8640 minutes (to Sunday 06:00).

```sql
-- requirements: forecast P50 for the target week, per SKU (sum of markets)
SELECT f.sku, round(sum(f.p50)) AS boxes FROM fact_demand_forecast f
WHERE NOT f.is_backtest AND f.target_start = DATE '<target monday>' GROUP BY f.sku;

-- OEE per line, last 30 days (line OEE is read at the CAP_INSPECT station)
SELECT line_code, (sum(run_s) * 1.0 / sum(available_s)) * (sum(good_qty) * 1.0 / sum(rated_units)) AS oee
FROM fact_oee_shift WHERE workcenter_code LIKE '%CAP_INSPECT'
  AND shift_date > (SELECT max(shift_date) FROM fact_oee_shift) - interval '30' day GROUP BY line_code;

-- humidity-risk hours (HIGH) in the target week, per line
SELECT line_code, ts FROM fact_room_risk WHERE is_forecast AND level = 'HIGH' ORDER BY line_code, ts;

-- equipment needing a maintenance window (health < 50)
SELECT h.asset_code, h.label, a.workcenter_code FROM dm_asset_health h JOIN dim_asset a ON a.asset_code = h.asset_code
WHERE h.health < 50;

-- the family each line is currently running
SELECT c.line_code, k.family FROM fact_changeover c JOIN dim_sku k ON k.sku = c.to_sku
WHERE c.start_ts = (SELECT max(start_ts) FROM fact_changeover x WHERE x.line_code = c.line_code);
```

Master data (use exactly): SKUs from `dim_sku` (`sku`, `short_code`, `product_name`, `family`,
`eligible_lines` comma-separated), changeover matrix from `dim_changeover_matrix`
(`from_family`, `to_family`, `minutes`, `purge_kg`, `cleaning`), rated speeds from `dim_line`
(`rate_rg_cpm`, `rate_milk_cpm`). 16 capsules per box.

Rules:
- Merge consecutive HIGH hours into windows `{line, start, end, level: "HIGH"}` (end = last hour + 1h).
- For each asset with health < 50 reserve **Monday 06:00–10:00** on its line as `blocked`
  (reason: "Maintenance <asset>"). If an AHU is below 75, add its inspection to the same window.
- Apply any constraint the user gives (e.g. "keep Iced milk coffee on L1" → set that SKU's
  `lines` to `["CAP_L1"]`; "add a Sunday shift" → `horizon_minutes` 9120).

## 2. Run the scheduler

Write `schedule/input.json`:

```json
{ "week_label": "2026-W41", "week_start": "2026-10-05T06:00:00", "horizon_minutes": 8640,
  "capsules_per_box": 16,
  "skus": [{"sku": "12450001", "short": "AMR", "name": "Americano capsule", "family": "RG_MED", "lines": ["CAP_L1", "CAP_L2"]}],
  "requirements": [{"sku": "12450001", "boxes": 89360}],
  "lines": [{"line": "CAP_L1", "rate_cpm": {"RG": 420, "MILK": 380}, "oee": 0.75}],
  "changeover": {"RG_MED": {"MILK": [45, 16, "DRY_CLEAN"]}},
  "blocked": [{"line": "CAP_L2", "start": "2026-10-05T06:00:00", "end": "2026-10-05T10:00:00", "reason": "Maintenance DOSING_AUGER_L2"}],
  "risk_windows": [{"line": "CAP_L2", "start": "2026-10-06T13:00:00", "end": "2026-10-07T21:00:00", "level": "HIGH"}],
  "initial_family": {"CAP_L1": "RG_MED", "CAP_L2": "RG_MED"} }
```

Then: `python3 /usr/share/minder/skills/demo2-weekly-scheduling/scheduler.py schedule/input.json --out schedule --report`

It writes `schedule/schedule.json`, `schedule/kpis.json`, `schedule/report.md` and
`schedule/gantt.png`. The totals in `kpis.json` include `changeovers`, `purge_kg`,
`wet_cleans`, `unmet_total` and `milk_minutes_in_high_risk` (must be 0). If `unmet_total > 0`,
say which SKU and why, and propose one fix (Sunday shift, pre-build the week before, or moving a
shared SKU) — then re-run if the user agrees.

## 3. Deliver

- Create the document with `create_document`: a PDF via the `pdf-report` skill if it is
  available (include `schedule/gantt.png`), otherwise `path: "schedule/report.md"`.
  Filename: `Production schedule <week_label> - Minder.pdf` (or `.md`).
- In chat, lead with the business result: changeovers, purge kg, wet cleans vs the hand-made
  plans (average from `fact_plan_slot`/`fact_plan_header` where `source = 'MANUAL'`), milk kept
  out of HIGH windows, maintenance windows reserved, anything unmet. Then a short slot table.
- Say plainly that the schedule comes from the Minder scheduler (campaign rules + changeover
  matrix) and needs the Site Manager's approval.

## Fallback (no Python / Bash unavailable)

If `Bash` or `python3` is unavailable, do NOT hand-craft a schedule. Read the latest plan the
same scheduler produced, stored in the warehouse:

```sql
SELECT s.line_code, s.start_ts, s.end_ts, k.product_name, s.planned_boxes, s.note
FROM fact_plan_slot s JOIN fact_plan_header h ON h.plan_id = s.plan_id JOIN dim_sku k ON k.sku = s.sku
WHERE h.source = 'MINDER_AI' AND h.plan_week = (SELECT max(plan_week) FROM fact_plan_header WHERE source = 'MINDER_AI')
ORDER BY s.line_code, s.start_ts;
```

Compare with how the hand-made plans actually ran (use these exact queries; full weeks only):

```sql
-- hand-made weeks: executed changeovers, purge and wet cleans per week
SELECT avg(n) AS changeovers, avg(kg) AS purge_kg, avg(wet) AS wet_cleans FROM (
  SELECT date_trunc('week', start_ts) AS w, count(*) AS n, sum(purge_kg) AS kg,
         sum(CASE WHEN cleaning = 'WET' THEN 1 ELSE 0 END) AS wet
  FROM iceberg.demo2_coffee_capsules.fact_changeover
  WHERE start_ts < (SELECT date_trunc('week', max(start_ts)) FROM iceberg.demo2_coffee_capsules.fact_changeover)
    AND start_ts >= (SELECT min(date_trunc('week', start_ts)) + interval '7' day FROM iceberg.demo2_coffee_capsules.fact_changeover)
  GROUP BY 1) t;

-- the Minder plan: changeovers, purge and wet cleans implied by its slot order
WITH s AS (
  SELECT p.line_code, p.start_ts, p.sku, k.family,
         lag(p.sku) OVER (PARTITION BY p.line_code ORDER BY p.start_ts) AS prev_sku,
         lag(k.family) OVER (PARTITION BY p.line_code ORDER BY p.start_ts) AS prev_family
  FROM iceberg.demo2_coffee_capsules.fact_plan_slot p
  JOIN iceberg.demo2_coffee_capsules.fact_plan_header h ON h.plan_id = p.plan_id
  JOIN iceberg.demo2_coffee_capsules.dim_sku k ON k.sku = p.sku
  WHERE h.source = 'MINDER_AI' AND h.plan_week = (SELECT max(plan_week) FROM iceberg.demo2_coffee_capsules.fact_plan_header WHERE source = 'MINDER_AI'))
SELECT count(*) AS changeovers, sum(m.purge_kg) AS purge_kg, sum(CASE WHEN m.cleaning = 'WET' THEN 1 ELSE 0 END) AS wet_cleans
FROM s JOIN iceberg.demo2_coffee_capsules.dim_changeover_matrix m ON m.from_family = s.prev_family AND m.to_family = s.family
WHERE s.prev_sku IS NOT NULL AND s.prev_sku <> s.sku;
```

(The Minder figure counts changeovers between slots; the scheduler also counts the one at the
start of the week on each line, so it may report two more.)

Present it, explain it with the risk and maintenance inputs above, and create a markdown
document with `create_document({filename, content})`. Tell the user it is the plan from the
scheduled run and that re-planning with new constraints needs the sandbox.

# Demo Data 2 (coffee capsules) — seed run order

Mock data only. The source data is already in the compose `sample-postgres` service
(schema `demo2_coffee_capsules`, loaded from `mock-data/init`), so there is no
source-DB step. Ids are kept in `demo2-coffee-capsules/demo-ids.json`, separate
from Demo Data 1.

## Environment

All optional against the local compose stack (see `../lib/http.mjs`):

```bash
export CELESNITY_CORE_URL=http://127.0.0.1:3001/api/v1   # deployed: also CELESNITY_ACCESS_TOKEN
export LOCAL_DEV_AUTH_SIGNING_KEY=…                       # only if .env overrides the compose default
export MINDER_AGENT_URL=http://127.0.0.1:8090/api/v2
export SAMPLE_POSTGRES_HOST=sample-postgres               # SAMPLE_POSTGRES_* = source DB as Core sees it
export DATABASE_URL=postgresql://…                        # step 8 only; defaults to the local Core DB
```

## Order (`node mock-data/demo2-coffee-capsules/seed/<script>`)

| # | Script | What it does |
|---|---|---|
| 1 | `01-seed-plant-site.mjs` | Site `DEMO2_COFFEE_CAPSULES` from template `demo2-coffee-capsules` (52 nodes, 24 routes), published v1 |
| 3 | `03-seed-data-platform.mjs` | Iceberg DB `demo2_coffee_capsules`, DB service, crawler, ~40 pipelines (map / derive / refresh), 3 data workflows, MQTT adapter |
| 4 | `04-seed-charts.mjs [--dry-run]` | Collection + 42 charts (preview-first) |
| 5 | `05-seed-dashboards.mjs [--dry-run]` | 6 dashboards, filters, plant-site association, render check |
| 6 | `06-agents.mjs [--print\|--revert]` | English Demo Data 2 prompt on chat-assistant + plant-model-assistant (re-apply after an agent reset) |
| 7 | `07-seed-automations.mjs [--test-fire]` | Weekly planning workflow (Thu 14:00) + pre-shift risk bulletin (Mon–Sat 05:30) |
| 8 | `08-seed-chat-artifacts.mjs` | Asks the 7 scripted questions, keeps the charts (rehearsal) |
| 9 | `09-seed-streaming.mjs` | MQTT → `fact_signal` pipelines, once `replay_publisher.py` has produced bronze data |

`reset.mjs --yes [--drop-tables]` tears down what the API can delete.

The weekly scheduler lives in `scheduler/scheduler.py` (stdlib + optional matplotlib) and is
shipped to the agent as the global skill `minder-agent/.agents/skills/demo2-weekly-scheduling/`
— keep the two copies of `scheduler.py` identical.

## Local-stack notes

- The metadata crawl runs through the message bus: the broker **and** the Core worker must be
  up (restart the worker if it died at boot with "Connection error").
- The agent's `Bash` tool needs the sandbox runner. Without it the scheduling skill falls back
  to the Minder plan already stored in the warehouse (`mes_plan_*`, source `MINDER_AI`).
- For step 9, generate the live sensor CSV first:
  `node mock-data/demo2-coffee-capsules/generate.mjs --end-date 2026-10-09 --out mock-data/demo2-coffee-capsules/out`.

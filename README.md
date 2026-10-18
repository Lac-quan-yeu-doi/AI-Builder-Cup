# Celesnity Mono Repo (release/0.5.0)

This directory contains release/0.5.0 snapshots of the Web, Core, Agent, and Infrastructure repositories, plus the workspace Docker Compose configuration.

## Components

- `celesnity-web/` — Web application; see [README.web.md](README.web.md).
- `celesnity-core/` — Core API and worker; see [README.core.md](README.core.md).
- `minder-agent/` — Agent runtime; see [README.agent.md](README.agent.md).
- `celesnity-infra/` — Shared service config (Trino, Spark, Redpanda, EMQX) and a standalone local data stack; see [README.infra.md](README.infra.md).
- `mock-data/` — Demo Data 1 (home appliance) and Demo Data 2 (coffee capsules), loaded into the `sample-postgres` service, with their curated Iceberg warehouses loaded by `trino-seed`; see [mock-data/README.md](mock-data/README.md).

## Run with Docker Compose

1. Copy `.env.example` to `.env` and fill in the required values.
2. Run `docker compose up -d --build` from this directory.

The app is served by nginx on port 80 (http://localhost locally). Only nginx is public; Postgres, MinIO, Trino, Spark and the agent bind to `127.0.0.1` (reach them over an SSH tunnel).

## Deploy on a VPS

1. Install Docker Engine + Compose v2, open port 80, clone this repo.
2. `cp .env.example .env`, then set `LLM_API_KEY`, `WEB_ORIGIN=http://<VPS_IP>` (exact browser origin, used for Origin/CSRF checks) and replace the default passwords.
3. `docker compose up -d --build`. One-shot jobs (`*-init`, `*-migrate`, `trino-seed`) exit 0; `--wait` reports those as failures, so check with `docker compose ps -a` instead.
4. Open `http://<VPS_IP>` and pick a persona. Auth is `local-development`: anyone with the URL can sign in.

Bootstrap jobs: `celesnity-migrate` runs migrations → `seed/core-local-personas.sql` → Core's organization bootstrap; `minder-manifest-migrate` seeds the built-in agents (`seed/agent-manifest-migrations.mjs`); `trino-seed` loads the read-only sample warehouses in `trino/seed/` (`iceberg.demo` and the Demo Data 1 and 2 warehouses, which take a few minutes on the first run and are skipped after that).

### Resources (2 vCPU / 5 GB host, one user)

Every service has a `deploy.resources.limits` in `docker-compose.yaml`. Long-running services sum to ~4.4 GiB of memory limits (measured ~2.4 GiB in use after a chat, a 12M-row Trino query and a Spark job); CPU limits are per-container ceilings.

| Service | Memory | CPU | Notes |
|---|---|---|---|
| trino-coordinator | 896M | 1.5 | single node (`trino-worker` 0 replicas), heap 65% via `trino/jvm.config`, 256MB per query |
| spark-master | 768M | 1.0 | jobs run `local[1]` here (`spark-worker` 0 replicas), driver 512m |
| redpanda | 512M | 0.5 | `--memory=448M` (lower aborts on start) |
| minder-sandbox-runner | 384M | 1.0 | |
| celesnity-api / celesnity-worker | 352M | 1.0 / 0.5 | Node heap 224M |
| minio | 320M | 0.5 | `GOMEMLIMIT=256MiB` |
| minder-runtime | 320M | 0.5 | Node heap 192M |
| celesnity-web | 224M | 1.0 | Node heap 144M |
| postgres | 192M | 0.5 | |
| sample-postgres / minder-db | 96M | 0.25 | |
| nginx | 32M | 0.25 | |

With more RAM: `--scale celesnity-web=2` (nginx picks up replicas), `TRINO_WORKER_REPLICAS`, or `SPARK_WORKER_REPLICAS` (required for the `streaming` profile).

Compose dependencies from `trino/seed/` are included. Component-specific environment examples are available at the root as `.env.web.example`, `.env.core.example`, and `.env.infra.local.example`.

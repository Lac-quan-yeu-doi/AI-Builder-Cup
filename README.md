# Minder

Minder is a Physical Intelligence Operating System for industry. It first centralizes a plant's data: machine sensors (MQTT), MES and ERP records and files flow into one governed store. A data ontology maps every area, line, station and machine and binds each to live values. On top of it, a digital twin shows the plant in 2D and 3D, and can be built from a 1–3 minute phone walkthrough in about 20–40 seconds. Minder AI reads the ontology and live data, explains what changed, projects what comes next and cites every source. Automated and predictive workflows turn this into action: an expert's repair video becomes a voice-led, photo-checked guide, and automations run on events, with a person approving every step. Advanced analytics tracks OEE, yield, energy and demand on live dashboards.

## Repository

| Folder | Contents |
|---|---|
| `celesnity-web/` | Web app — [README.web.md](README.web.md) |
| `celesnity-core/` | Core API and worker — [README.core.md](README.core.md) |
| `minder-agent/` | Minder AI agent runtime — [README.agent.md](README.agent.md) |
| `celesnity-infra/` | Trino, Spark, Redpanda and EMQX config — [README.infra.md](README.infra.md) |
| `mock-data/` | Demo Data 1 (home appliance) and 2 (coffee capsules) — [mock-data/README.md](mock-data/README.md) |

Release 0.5.0 snapshots, run together by `docker-compose.yaml`.

## Run

```bash
cp .env.example .env
```

Set `LLM_API_KEY` in `.env`, then:

```bash
docker compose up -d --build
```

Open http://localhost. Only nginx is public (port 80, or `NGINX_PORT`); Postgres, MinIO, Trino, Spark and the agent bind to `127.0.0.1`. One-shot jobs (`*-init`, `*-migrate`, `trino-seed`) exit 0, which `--wait` reports as a failure, so check them with `docker compose ps -a`.

Every organization can read three sample warehouses out of the box: `demo`, `demo1_home_appliance` and `demo2_coffee_capsules`. The first start on empty volumes takes a few extra minutes while `trino-seed` loads them.

## Deploy on a VPS

1. Install Docker Engine and Compose v2, open port 80, clone this repo.
2. `cp .env.example .env`, set `LLM_API_KEY`, `WEB_ORIGIN=http://<VPS_IP>` (the exact browser origin, used for Origin/CSRF checks) and replace the default passwords.
3. `docker compose up -d --build`, then open `http://<VPS_IP>`. Auth is `local-development`: anyone with the URL is signed in as the organization owner.

To update: `git pull` and `docker compose up -d --build`. When `celesnity-infra/config/trino/` changed, also run `docker compose restart trino-coordinator` and then `docker compose up -d trino-seed`.

<details>
<summary>Resources: sized for a 2 vCPU / 5 GB host, one user</summary>

Every service has `deploy.resources.limits` in `docker-compose.yaml`. Long-running services sum to ~4.4 GiB of memory limits (measured ~2.4 GiB in use after a chat, a 12M-row Trino query and a Spark job); CPU limits are per-container ceilings.

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

</details>

<details>
<summary>Bootstrap jobs</summary>

- `celesnity-migrate`: migrations → `seed/core-local-personas.sql` → Core's organization bootstrap.
- `minder-manifest-migrate`: the built-in agents (`seed/agent-manifest-migrations.mjs`).
- `trino-seed`: the read-only sample warehouses in `trino/seed/`; the Demo Data ones load once and are skipped after that.

Component-specific environment examples: `.env.web.example`, `.env.core.example`, `.env.infra.local.example`.

</details>

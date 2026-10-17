# Celesnity Mono Repo (release/0.5.0)

This directory contains release/0.5.0 snapshots of the Web, Core, Agent, and Infrastructure repositories, plus the workspace Docker Compose configuration.

## Components

- `celesnity-web/` — Web application; see [README.web.md](README.web.md).
- `celesnity-core/` — Core API and worker; see [README.core.md](README.core.md).
- `minder-agent/` — Agent runtime; see [README.agent.md](README.agent.md).
- `celesnity-infra/` — GCP and local infrastructure; see [README.infra.md](README.infra.md).
- `mock-data/` — Demo Data 1 (home appliance) and Demo Data 2 (coffee capsules), loaded into the `sample-postgres` service; see [mock-data/README.md](mock-data/README.md).

## Run with Docker Compose

1. Copy `.env.example` to `.env` and fill in the required values.
2. Run `docker compose up -d --build --wait` from this directory.

Compose dependencies from `trino/seed/` are included. Component-specific environment examples are available at the root as `.env.web.example`, `.env.core.example`, and `.env.infra.local.example`.

# minder-agent

`minder-agent` is a native TypeScript runtime replacing the former Rust service incrementally. It provides an OpenAI-compatible agent loop, caller-scoped HTTP/SSE runs, optional PostgreSQL durability, a Kubernetes-ready Node service, and a CLI. The active runtime is runnable today; later parity work remains explicitly separated from the active path.

Implementation status is tracked in the active TypeScript source tree and architecture tests.

See the [architecture diagram](docs/minder-agent-architecture.html) for the main run path and the [roadmap](ROADMAP.md) for proposed work. Feature proposals include a reusable agent harness with named work lanes, durable loop controls, safer long conversations, conversation branches and exports, agent evaluations, and searchable run history.

## Requirements

- Node.js `>=22.19.0`
- npm
- Docker for the image smoke test
- `kubectl` for manifest rendering
- Google Cloud CLI only for Cloud Build/GKE deployment

## CLI

Install the pinned workspace dependencies, configure an OpenAI-compatible streaming endpoint, and run one task:

```bash
npm install --ignore-scripts
npm run hooks:install
export LLM_BASE_URL="https://provider.example/v1"
export LLM_API_KEY="replace-me"
export LLM_MODEL="provider-model"
npm run cli -- "summarize this task"
```

Reasoning is written to stderr; assistant text is written to stdout. `LLM_TEMPERATURE` is optional. Autonomous turns can call the confined `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, and `Bash` tools. The CLI process itself remains stateless; sandboxed tools require a configured local sandbox-runner socket.

Gemini is supported through an OpenAI-compatible `/chat/completions` endpoint. Set `LLM_PROVIDER=gemini` for explicit selection; Gemini is also inferred from a Gemini model name, Google endpoint, or Google API key.

## Interactive chat and core tools

Use the same provider configuration with a model that supports OpenAI-compatible function/tool calls:

```bash
export LLM_BASE_URL="https://provider.example/v1"
export LLM_API_KEY="replace-me"
export LLM_MODEL="tool-capable-model"
npm run cli -- --chat
```

The chat session keeps its history only in the current process. Enter `/exit` to leave. Interactive runs expose `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `Bash`, and `AskUser`. File mutations are serialized per resolved path; exact edits preserve a UTF-8 BOM and the existing line ending style. Tool results are bounded and paths are confined to the current workspace. `Bash` runs inside the per-Pod sandbox runner with full read/write access to the active workspace and the installed offline tools, including Typst, Pandoc, Python, and Matplotlib. The normal `typst compile` command automatically applies the sandbox's Celesnity/Aurora style to Typst and Markdown reports. Bash remains a generic command tool, so another PDF generation path can bypass that style. It has no automatic execution timeout; cancellation stops the process. The host and network remain isolated, and sensitive workspace files stay blocked. The built-in `pdf-report` skill guides report content and file retention. Download the PDF through `GET /api/v1/runs/{runId}/files/content?path=reports/<name>.pdf`; the existing route enforces owner authorization and its 10 MiB limit.

The Kubernetes deployment builds the runner from `sandbox-runner/Dockerfile`. It requires Bubblewrap user-namespace support from the GKE node runtime. The runner fails startup if Bubblewrap, seccomp, or its actual namespace probe is unavailable; it never executes an unsandboxed fallback. The runner has no Minder application secrets. Example: `python3 -c 'import csv; print(sum(1 for _ in csv.DictReader(open("data.csv"))))'`.

## Local checks

```bash
npm install --ignore-scripts
npm run hooks:install
npm run test:compat
npm run test:phase-0
npm run test:phase-1
npm run test:phase-2
npm run test:phase-3
npm run test:phase-4
npm test
npm run check
npm run build
```

Run `npm run hooks:install` once in each clone to enable the repository's
`.githooks/pre-commit`. It runs Prettier and ESLint autofix over `src/` before
each commit. If formatting changes tracked source files, the hook stops the
commit so you can review and stage the changes before retrying.

Run the host locally:

```bash
npm run dev
curl --fail http://127.0.0.1:8080/api/v1/healthz
```

The health response is exactly `{"status":"ok"}`. `/api/v1/metrics` returns Prometheus text. `/healthz`, `/metrics`, and `/stats` remain unversioned operational aliases for probes. Without LLM configuration, versioned agent routes return `503 {"error":"runtime_not_configured"}` after caller authentication.

New clients use `/api/v2`. See the [v1 to v2 migration guide](docs/api/migration-v1-to-v2.md) for changed routes, cursors, and request correlation. The local Swagger UI and its JSON document are available while the host runs:

```text
http://127.0.0.1:8080/api/docs
http://127.0.0.1:8080/api/docs/openapi.json
```

Export the maintained [OpenAPI YAML](docs/api/openapi/minder-agent.yaml) after changing an HTTP contract:

```bash
npm run openapi:export
```

## Phase 3 in-memory HTTP runtime

The Node host preserves `/api/v1/healthz` and `/api/v1/metrics` without LLM configuration. When `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are set, it also provides caller-scoped in-memory turns:

```bash
npm run dev
curl -i http://127.0.0.1:8080/api/v1/turns \
  -H 'content-type: application/json' \
  -H 'x-caller-id: demo-user' \
  --data '{"session_key":"chat:demo","input":"Summarize the repository"}'
```

The `202` response contains an `/api/v1` `events_url`; consume it with `curl -N` and the same `x-caller-id`. `GET /api/v1/sessions?key=...` and `GET /api/v1/runs/<run_id>/status` expose process-local metadata. Complete an `awaiting_client_tool` event with `POST /api/v1/client-tool-results` using the same caller and call ID. `POST /api/v1/webhooks/<source>` supports optional `x-delivery-id` deduplication. Without `DATABASE_URL`, sessions, runs, and event journals are intentionally lost when the process exits.

## Phase 4 PostgreSQL durability

Set `DATABASE_URL` alongside the LLM settings to select the durable runtime. Startup creates the TypeScript-owned durable-core tables, recovers queued/running runs as interrupted, and preserves the existing HTTP/SSE contracts:

```bash
export DATABASE_URL="postgres://minder:minder@127.0.0.1:5433/minder_test"
npm run dev
```

The integration suite uses only the throwaway PostgreSQL service:

```bash
docker compose -f docker-compose.test.yml up -d
export MINDER_TEST_DATABASE_URL="postgres://minder:minder@127.0.0.1:5433/minder_test"
npm run test:phase-4
docker compose -f docker-compose.test.yml down
```

### API integration and black-box E2E tests

The in-process API integration test runs without Docker or PostgreSQL and
covers the composed HTTP run lifecycle, event completion, status reads, and
caller isolation:

```bash
npm test -- src/tests/presentation/http/production-integration.test.ts
```

The compiled-service E2E starts the built `minder-agent` over TCP, uses a
local fake OpenAI-compatible provider, and persists the run through the
throwaway PostgreSQL and MinIO services. It never calls an external provider
or uses the development database/object store:

```bash
docker compose -f docker-compose.test.yml up -d --wait
export MINDER_TEST_DATABASE_URL="postgres://minder:minder@127.0.0.1:5433/minder_test"
npm run build
npm run test:phase-4 -- src/tests/phase-4/agent-api-e2e.test.ts
docker compose -f docker-compose.test.yml down
```

If ports `5433` or `9001` are already occupied, set
`MINDER_TEST_DB_PORT` and `MINDER_TEST_MINIO_PORT` consistently for Compose
and the test command. The E2E uses a short-lived Core assertion per HTTP
request because assertion `jti` values are replay-protected.

To intentionally start fresh, reset only the known Rust-owned Minder tables. The command never runs during server startup, never uses `CASCADE`, preserves unrelated application tables and `_sqlx_migrations`, and requires the exact confirmation token:

```bash
DATABASE_URL="$MINDER_TEST_DATABASE_URL" \
MINDER_RESET_CONFIRM=DROP_MINDER_RUST_DATA \
npm run db:reset:minder
```

This reset is destructive and is not reversible; the reset database is for the TypeScript runtime and is not a supported target for a later Rust runtime. Provide `DATABASE_URL` through the deployment’s secret configuration when durable agent routes are enabled.

## Agent configuration API

Agent configuration is PostgreSQL-oriented by design, while tenant-scoped YAML manifests and prompt assets are loaded from the S3-compatible manifest workspace. The compatibility server exposes an owner-isolated in-memory handler at `POST /agents`, `GET /agents`, `GET /agents/<id>`, and `PATCH /agents/<id>`. Every request requires `x-caller-id`.

```bash
curl -X POST http://127.0.0.1:8080/agents \
  -H 'content-type: application/json' \
  -H 'x-caller-id: demo-user' \
  --data '{"id":"reviewer","name":"reviewer","executionStrategy":"react","skills":[],"toolAllowlist":[]}'
```

The owner-scoped HTTP API exposes create, read, list, update, history, diff, rollback, and archive. Agent revisions remain immutable.

## Implementation notes

- Context instruction resolution supports ordered project/subdirectory files, frontmatter path rules, bounded includes, comment stripping, and diagnostics.
- Skills support global-over-project precedence, allowlists, hashing, and owner-scoped persistence adapters.
- The native loop provides ordered tool events, autonomous tool turns, and interactive steering/follow-up queues.
- `src/application/room` provides a process-local bounded room actor with journal-before-broadcast lifecycle events. Room HTTP routes and room SSE are wired. With `DATABASE_URL`, the room queue and journal use PostgreSQL, and actor activation rehydrates queued work. Coordination across multiple service replicas remains a roadmap item.
- `src/infrastructure/workspace` provides local and S3/MinIO-backed, tenant- and room-confined workspace resolution. Production startup rejects incomplete S3 configuration instead of falling back to the source checkout.
- The tool registry has central policy and output-redaction hooks. Runtime composition includes the core file/process tools plus executable state and allowlisted HTTP tools; optional Trino/skill/report tool ports remain dependency-injected. Client-tool pause/resume, run manifests, traces, validation status, reports, and file-access provenance are persisted when PostgreSQL is enabled.
- Reliability reads are available at `GET /api/v1/runs/<run_id>/{manifest,trace,validation,report,files}` and `GET /api/v1/runs/<run_id>/files/content?path=...`; every route is owner-authorized.
- Reliability includes secret redaction, bounded output validation, and fail-open telemetry primitives. Operational tracing, CORS, Langfuse integration, and cutover rehearsal are not wired yet.

## Shared skills

Checked-in global skills live under `.agents/skills/<skill-name>/`. Each folder
contains a `SKILL.md` with YAML frontmatter fields `name` and `description`;
`namespace` is optional and defaults to an empty string. The folder name must
match `name`, which uses lowercase kebab case.

Install a Codex- or Claude-compatible skill by copying its folder into the
repository and committing it:

```bash
mkdir -p .agents/skills
cp -R /path/to/skill .agents/skills/<skill-name>
```

Global skills are available to every owner, but each agent's existing skill
allowlist still controls which ones it can invoke. The checked-in source is
read-only. The Agent loads instructions through the existing `ListSkills` and
`InvokeSkill` tools, and the sandbox exposes package resources at
`/usr/share/minder/skills/<skill-name>/` for read-only access.

## Container

```bash
docker build --pull --tag minder-serve:phase-0 .
bash src/tests/phase-0/container-smoke.sh minder-serve:phase-0
```

The runtime image is distroless Node, runs as UID/GID `65532:65532`, and is designed for a read-only root filesystem. Kubernetes probes provide container health checks.

## Google Cloud / GKE

For the sandbox runner's isolation gate and development-only GKE verification,
see [sandbox verification](docs/operations/sandbox-verification.md).

Render both overlays without changing the cluster:

```bash
npm run k8s:render:dev > /tmp/minder-gcp-dev.yaml
npm run k8s:render:prod > /tmp/minder-gcp-prod.yaml
kubectl apply --dry-run=client --validate=false -f /tmp/minder-gcp-dev.yaml
kubectl apply --dry-run=client --validate=false -f /tmp/minder-gcp-prod.yaml
```

Run the no-deploy Cloud Build verification pipeline first:

```bash
gcloud builds submit --config cloudbuild.verify-phase-0.yaml .
```

The live development pipeline is restricted to the existing `gcp-dev` cluster and requires the existing Artifact Registry repository, GKE cluster, `minder` namespace, `celesnity-agent` service account, managed Prometheus `PodMonitoring` CRD, and a Cloud Build service account with `roles/secretmanager.secretAccessor`:

```bash
gcloud builds submit --config cloudbuild.yaml .
```

Cloud Build builds and pushes an immutable image, reads the selected environment's runtime values from Secret Manager, applies the rendered overlay, and waits for the Deployment rollout. Its target validation permits only the approved development and production projects and clusters; production promotion still requires separate approval.

After Core is deployed, the Agent pipeline runs a version-pinned manifest-workspace
migration Job before rolling out the Agent image. Migration definitions under
`migrations/agent-manifests/` lock the content hashes of immutable YAML snapshots;
the generic runner applies pending migrations once per organization and records
their versions in its scoped manifest workspace. Using its Google workload identity,
it reads all active organization/tenant bindings from Core's private
`/api/v1/internal/agent-manifest-organizations` endpoint, then provisions the five
bundled organization agents only when their manifests are absent. There is no
single-bootstrap-organization Secret Manager input. The authenticated runtime
loader also applies pending migrations on first access to each organization's
manifest workspace, covering organizations created after deployment. Existing manifests
and administrator edits are preserved; a missing identifier or invalid
manifest fails the deployment gate. The Job does not grant catalog access or
enable a Core service identity.

The dev pipeline expects these Secret Manager names: `gcp-dev-minder-llm-base-url`, `gcp-dev-minder-llm-api-key`, `gcp-dev-minder-database-url`, `gcp-dev-mcp-shared-secret`, `gcp-dev-gcs-hmac-access-key`, and `gcp-dev-gcs-hmac-secret-key`. The HMAC pair is shared with the platform storage setup; create the LLM, database, and MCP values before submitting the build. Secret values are injected only into the ephemeral build workspace.

## Repository direction

Each migration phase is runnable and testable. The active composition path covers CLI and HTTP/SSE runs, native loop/tool sequencing, agent configuration, rooms, and PostgreSQL run durability. Availability of other capabilities depends on their configured adapters. Proposed improvements and acceptance criteria are in the [roadmap](ROADMAP.md).

## Contract workspace

The TypeScript scaffold makes every remaining Rust feature family explicit without enabling it early. Pure values live in `src/domain`; application contracts live in `src/application`; infrastructure contracts live in `src/infrastructure`.

Some packages remain contract-only; the implementation notes above identify the current adapters. Run `npm run test:architecture` to validate public imports and dependency direction.

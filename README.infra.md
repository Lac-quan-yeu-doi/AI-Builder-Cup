# Celesnity Infrastructure

Infrastructure for the Celesnity proof of concept: PostgreSQL, Apache Spark, object storage, an Apache Iceberg catalog, and Trino. The supported targets are local Docker Compose plus independent GCP development and production environments on GKE. The AWS modules remain only as implementation reference; the `aws-dev` Terraform root and deployment overlay have been removed.

For the complete current GCP development design—including service relationships, GKE workloads, ingress and east-west traffic, VPC addressing, identity, storage, observability, deployment flows, and known gaps—read [GCP development architecture](docs/gcp-dev-architecture.md). For the cross-repository view covering `celesnity-infra`, `celesnity-core`, `celesnity-web`, and `celesnity-agent`, read [System architecture](docs/system-architecture.md). A sanitized copy suitable for an external Google Cloud architecture review is available at [GCP external architecture review](docs/gcp-architecture-external-review.md).

> Local runs with development credentials. GCP adds Trino password authentication and HTTPS, while production additionally enables regional infrastructure and Redpanda TLS. Read [Security posture](#security-posture) before exposing any of this.

## Repository layout

The tree is organised by *what a directory is for*, not by technology. Three deployment targets share one set of configuration.

```text
celesnity-infra/
├── Makefile                  Single entrypoint for every workflow
│
├── config/                   Environment-agnostic. Shared by local and cloud.
│   ├── trino/                Coordinator, worker, node, access-control
│   └── sql/                  Iceberg catalog DDL
│
├── images/                   Container images this repo builds
│   └── spark/                Dockerfile + standalone entrypoints
│
├── local/                    Docker Compose target
│   ├── compose.yaml
│   ├── .env.example
│   └── catalog/              MinIO-flavoured Iceberg catalog
│
├── infra/                    Terraform, one module set per cloud
│   ├── modules/
│   │   ├── aws/              retained reference modules; no active environment
│   │   └── gcp/              network, cluster, data, platform, streaming, observability
│   └── environments/
│       ├── gcp-dev/          zonal GKE development in asia-southeast1
│       └── gcp-prod/         regional GKE production in europe-west2
│
└── deploy/                   Kubernetes workloads
    ├── base/                 Trino and Spark, entirely cloud-neutral
    └── overlays/
        ├── gcp-dev/          development namespace, replicas, GCS catalog
        └── gcp-prod/         production namespace, policies, Gateway and GCS catalog
```

Everything is selected by two variables:

```bash
make deploy CLOUD=gcp ENV=dev
make deploy CLOUD=gcp ENV=prod
```

`CLOUD` and `ENV` together pick both the Terraform root and the kustomize overlay, so the two cannot drift apart.

### Why this shape

**`config/` is the single source of truth.** The Trino coordinator, worker, node, and access-control files are read by *both* targets: Compose bind-mounts them, and `deploy/base` pulls them in through a kustomize `configMapGenerator`. Editing `config/trino/worker.properties` changes both. They stay portable because they use Trino's `${ENV:VAR}` substitution rather than hardcoded values.

**Only the Iceberg catalog is duplicated, and deliberately.** It is the one Trino file that genuinely differs per target:

| | Storage | Credentials |
|---|---|---|
| `local/catalog/` | MinIO, path-style, static keys | `s3.aws-access-key` in env |
| `deploy/overlays/gcp-dev/catalog/` | GCS, `fs.gcs.enabled` | Workload Identity Federation |
| `deploy/overlays/gcp-prod/catalog/` | Separate production GCS buckets | Workload Identity Federation |

All three sit side by side so the difference is visible rather than buried in conditionals.

**`config/sql/01-iceberg-catalog.sql` runs in both places.** Compose mounts it into `docker-entrypoint-initdb.d`; RDS has no equivalent, so the platform module ships the same file as a ConfigMap and applies it with a Job.

**Terraform is modules plus environments, with a cloud dimension.** Adding staging or production means a new directory under `infra/environments/` with its own state and its own `terraform.tfvars` — not a commented-out block. The modules take the cost-relevant settings as variables, so scaling up is a value change.

**The two clouds share the workload layer, not the foundation.** `deploy/base` is genuinely cloud-neutral: the same Trino and Spark manifests, the same `config/trino` files, the same Alloy pipeline. What differs is confined to the overlay — the Iceberg catalog and any Ingress. There is no attempt to abstract over VPCs, clusters, or IAM, because the two models are different enough that a common wrapper would fit neither.

The Terraform contract between the layers is a set of fixed Kubernetes object names. Both clouds create a `celesnity` ServiceAccount, a `celesnity-database` Secret, and a `celesnity-storage` ConfigMap with the same keys. That is what lets `deploy/base` stay unaware of which cloud it is running on.

**`deploy/base` is not deployable alone.** It has no namespace and no catalog; both come from an overlay. That is intentional, so an environment cannot be applied by accident.

## Prerequisites

| Workflow | Needs |
|---|---|
| Local | Docker Desktop or Engine, Compose v2, ~3 GB available to Docker for the lightweight stack |
| GCP | Terraform ≥ 1.10, `gcloud` with both a CLI login and ADC, `kubectl` |
| Checks | `kubeconform`, `grafana-alloy` (both via `brew install`) |

Run `make` with no arguments to list every target.

## Local development

```bash
cp local/.env.example local/.env
make up
make ps
```

Trino, Spark, PostgreSQL, and MinIO should report healthy; `minio-init` exits 0 after creating buckets.

| Service | Host address |
|---|---|
| Trino | http://localhost:18082 |
| Spark master UI | http://localhost:8081 |
| MinIO console | http://localhost:9001 |
| PostgreSQL | localhost:15432 |

The lightweight stack runs a Trino coordinator plus one worker and a Spark master
plus one worker. Streaming, FTPS, and the MCP-Trino helper are opt-in so normal
API, catalog, pipeline, chart, and dashboard work does not pay for them:

```bash
make up-streaming  # adds EMQX, Redpanda, Connect, Console, and the streaming job
make up-cdc        # adds Redpanda and local Debezium Connect for Data Workflow CDC
make up-ftps       # adds SFTPGo and its bootstrap jobs
make up-full       # enables streaming, FTPS, and agent tools
```

The CDC profile reuses the same Redpanda broker and exposes Debezium Connect at
`http://127.0.0.1:18083`. It builds the local `quay.io/debezium/connect:3.6`
image with Celesnity's metadata-only SMT. Connector records contain only tenant
and source identities, database/schema/table metadata, operation, commit time,
and a SHA-256 source-position fingerprint. The SMT deliberately drops
snapshot-read and tombstone records and never forwards Debezium `before`,
`after`, or key fields. The profile is a local development runtime; it is not a
production credential or network-isolation design.

Start it directly when testing CDC:

```bash
docker compose --project-directory local -f local/compose.yaml \
  --profile cdc up -d --build --wait redpanda redpanda-init debezium-connect
curl http://127.0.0.1:18083/connectors
```

The same profile starts `cdc-fixture-postgres` on `127.0.0.1:15433`. It is a
disposable direct PostgreSQL source with logical WAL, the `public.orders` table,
and a pre-created publication/pgoutput slot. Its Debezium credentials are
`cdc_reader` / `cdc_fixture_reader_password`; use host
`cdc-fixture-postgres` from Core and Debezium, or `127.0.0.1:15433` from the
host. The fixture volume is separate from the platform database.

When Core runs in its Compose stack, set `DATA_WORKFLOW_CDC_ENABLED=true` and
`DEBEZIUM_CONNECT_URL=http://debezium-connect:8083` in Core's `.env`. Keep it
disabled when the CDC profile is not running; publishing a CDC workflow then
returns a safe setup-required status instead of starting a consumer against a
missing broker.

`make up-streaming` and `make up-full` default to two Spark workers: one for the
continuous stream and one for on-demand execution. The lightweight `make up`
uses one core on one Spark worker and caps each Trino process at 1 GiB.

Scale either service:

```bash
docker compose --project-directory local -f local/compose.yaml up -d \
  --scale trino-worker=3 --scale spark-worker=4
```

When raising the Trino worker count, raise `TRINO_QUERY_MAX_MEMORY` in `local/.env` to match — it is the cluster-wide budget, not a per-node one, so three workers means `1800MB`. Leaving it low under-uses the cluster; raising replicas without it lets the planner admit queries the workers cannot hold.

Submit a Spark job (the driver must run inside the Compose network so executors can reach it):

```bash
docker compose --project-directory local -f local/compose.yaml \
  exec spark-master /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 /path/to/job.py
```

Worker UIs are not published, because published ports collide once a service is scaled. Use the master UI for worker status and `make logs SERVICE=spark-worker` for detail.

Other targets: `make down` (keep data), `make reset` (**deletes all local data**), `make build`, `make trino`.

## Cloud deployment

GCP development and production Terraform and workload deployment are handed off
through the repository `cloudbuild.yaml`:

- pushes to `development` apply `gcp-dev` after its original local Terraform
  state has been adopted into the versioned GCS backend;
- semantic version tags such as `v1.2.3`, created from a commit on `main`, apply
  `gcp-prod`.

See [Cloud Build deployment](docs/cloud-build-deployment.md) for the trigger
contract, safety gates, and current development-state migration requirement.

The Terraform apply is deliberately two-stage: the Kubernetes and Helm providers cannot authenticate against a cluster that does not exist yet, so `make infra-apply` creates the cloud resources first and the Kubernetes ones second.

### GCP

```bash
gcloud auth login                              # the CLI identity
gcloud config set project <your-project>

gcloud auth application-default login          # Terraform reads ADC, NOT the above
gcloud auth application-default set-quota-project <your-project>

cd infra/environments/gcp-dev
cp terraform.tfvars.example terraform.tfvars   # set project_id
cd -

make whoami      CLOUD=gcp     # both identities must match — see below
make preflight   CLOUD=gcp
make infra-init  CLOUD=gcp
make infra-apply CLOUD=gcp     # two-stage, ~20 min
make kubeconfig  CLOUD=gcp
make image-push  CLOUD=gcp     # amd64; nodes are e2
make deploy      CLOUD=gcp
make status
```

For production, follow
[`infra/environments/gcp-prod/README.md`](infra/environments/gcp-prod/README.md)
and use the release-tag Cloud Build trigger instead of running Terraform apply
from a workstation.

`project_id` has no default on purpose — applying into the wrong GCP project is expensive to undo.

These APIs must be enabled on the project first:

```bash
gcloud services enable \
  container.googleapis.com sqladmin.googleapis.com \
  servicenetworking.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com compute.googleapis.com \
  iam.googleapis.com logging.googleapis.com
```

#### Two identities, and why `make whoami` is not optional

**Terraform does not use your `gcloud` CLI account.** It authenticates through Application Default Credentials, a separate credential store. The two drift routinely: `gcloud config` can name the correct account while ADC still holds a login from a different one.

The failure mode is nasty. Every Terraform *read* succeeds, so `terraform plan` produces a clean and entirely believable result. Every *write* then returns 403, which reads like a missing IAM role and is not one. `make whoami CLOUD=gcp` resolves the ADC token against the userinfo endpoint, prints both identities, and hard-fails when they differ:

```text
gcloud account         you@example.com
adc identity           someone-else@gmail.com
adc quota project      some-other-project
IDENTITY MISMATCH. Terraform authenticates as 'someone-else@gmail.com', not 'you@example.com'.
```

`make preflight` depends on this, so it fails fast too. Checking that the ADC *file exists* — the obvious check — does not catch this at all.

To confirm the account actually has what the apply needs, ask the API directly rather than reading role bindings:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://cloudresourcemanager.googleapis.com/v1/projects/<your-project>:testIamPermissions" \
  -d '{"permissions":["compute.networks.create","container.clusters.create",
       "cloudsql.instances.create","storage.buckets.create","iam.serviceAccounts.create",
       "secretmanager.secrets.create","servicenetworking.services.addPeering",
       "resourcemanager.projects.setIamPolicy","logging.buckets.update"]}'
```

Anything absent from the response is denied. `resourcemanager.projects.setIamPolicy` is the one to watch: the audit config needs it, and Editor does not include it.

#### Trino GCS auth must be `APPLICATION_DEFAULT`

Set in `deploy/overlays/gcp-dev/catalog/iceberg.properties`. The default is `SERVICE_ACCOUNT`, which Trino's documentation describes as loading credentials from the environment with `gcs.json-key` an optional override. In Trino 483 a config validation rejects that outright and the coordinator will not start:

```
Either gcs.json-key or gcs.json-key-file-path must be set
  (for class GcsServiceAccountAuthConfig.authMethodValid)
```

Supplying a key would mean creating and mounting a service account key file, which is precisely what Workload Identity exists to avoid. `APPLICATION_DEFAULT` resolves through the GKE metadata server instead.

The caveat: it does not fail loudly. If ADC is unavailable Trino falls back to `NoCredentials` and attempts unauthenticated access, so a broken Workload Identity binding appears as a 403 from GCS rather than a credential error. If you see unauthenticated denials, check the `iam.gke.io/gcp-service-account` annotation and the `workloadIdentityUser` binding before suspecting bucket permissions.

#### Cloud SQL edition must be explicit

`db_edition` is pinned to `ENTERPRISE` in `terraform.tfvars`. PostgreSQL 16 and later [default to Enterprise Plus](https://docs.cloud.google.com/sql/docs/postgres/choose-edition), which accepts only `db-perf-optimized-N-*` machines starting at 2 vCPU / 16 GiB — several times the cost of a shared-core instance. Leaving the edition unset silently couples it to the database version and fails at create time with `Invalid Tier (db-g1-small) for (ENTERPRISE_PLUS) Edition`. Two variable validations reject incompatible edition/tier pairs during `plan` rather than minutes into an `apply`.

#### If Helm releases fail on network errors

Over a long-haul link, the most fragile step in the whole apply is Helm's client-side validation, which downloads the API server's full OpenAPI schema — about 3 MB on GKE 1.35 — inside a fixed 32-second deadline. It fails as `network is unreachable` or `http2: client connection lost`, both of which look like a firewall problem rather than a timeout.

The Alloy and Grafana releases set `disable_openapi_validation = true` and `cleanup_on_fail = true` to remove that transfer and avoid leaving orphans behind. If a release still fails, re-run `make infra-apply CLOUD=gcp`; it is idempotent, and a release that fails while building manifests leaves no record to clean up. Verify with `helm list -n monitoring`.

`make infra-output CLOUD=<cloud>` prints the cluster name, bucket names, database endpoint, and a cost estimate derived from your current variable values. Both clouds provide the estimate.

### Architecture on AWS

| Local component | AWS equivalent |
|---|---|
| `postgres` container | RDS for PostgreSQL, Single-AZ |
| `minio` + `minio-init` | S3 buckets, reached via a free VPC gateway endpoint |
| `spark-master` / `spark-worker` | Deployments in the `celesnity` namespace |
| `trino-coordinator` / `trino-worker` | Deployments, fronted by an ALB Ingress |
| Static MinIO credentials | EKS Pod Identity — no stored keys |
| `docker compose logs` | Alloy → Loki → Grafana (see [Logging](#logging)) |

Worker nodes and RDS are pinned to one Availability Zone. The VPC still spans two, because EKS requires subnets in two AZs for its control plane ENIs and an ALB requires two subnets in two AZs. Single-AZ node placement avoids cross-AZ transfer, which is the dominant network cost for Spark shuffle and Trino exchange traffic.

### Architecture on GCP

Deployed and verified in `asia-southeast1`, zone `asia-southeast1-a`.

```text
                        Internet
                            │
              ┌─────────────┴──────────────┐
              │  you (gcloud ADC + IAM)    │
              └─────────────┬──────────────┘
                            │ HTTPS 443, IAM-gated, no CIDR allow-list
┌───────────────────────────┼────────────────────────────────────────┐
│ GKE control plane (Google-managed)   172.16.0.0/28                 │
│ v1.35.x · REGULAR channel · zonal asia-southeast1-a                │
└───────────────────────────┬────────────────────────────────────────┘
                            │
┌───────────────────────────┼────────────────────────────────────────┐
│ VPC  celesnity-gcp-dev                                             │
│                                                                    │
│  subnet celesnity-gcp-dev-nodes   10.30.0.0/20                     │
│    ├─ pods      10.31.0.0/16   (secondary range)                   │
│    └─ services  10.32.0.0/20   (secondary range)                   │
│    Private Google Access: ON                                       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ node pool · e2-standard-2 · 50GB pd-balanced         │          │
│  │ PRIVATE nodes (no public IP) · autoscale 1–4         │          │
│  │                                                      │          │
│  │  ns: celesnity          ns: monitoring               │          │
│  │  ├─ trino-coordinator   ├─ grafana                   │          │
│  │  ├─ trino-worker        ├─ loki (StatefulSet)        │          │
│  │  ├─ spark-master        └─ alloy (DaemonSet)         │          │
│  │  ├─ spark-worker                                     │          │
│  │  └─ iceberg-maintenance (CronJob)                    │          │
│  └───────┬──────────────────────┬─────────────┬─────────┘          │
│          │ Workload Identity    │ private IP  │ egress             │
│          ▼                      ▼             ▼                    │
│    ┌──────────┐         ┌──────────────┐  ┌──────────┐             │
│    │ GCS x3   │         │ Cloud SQL    │  │Cloud NAT │──▶ internet │
│    │ (via PGA)│         │ private IP   │  │ +Router  │   (outbound │
│    └──────────┘         └──────────────┘  └──────────┘    only)    │
│                          VPC peering, reserved /20                 │
└────────────────────────────────────────────────────────────────────┘
```

#### Services

| Service | Resource | Configuration |
|---|---|---|
| GKE Standard | `celesnity-gcp-dev` | Zonal, private nodes, public endpoint, REGULAR channel |
| Compute Engine | node pool | 2 × `e2-standard-2` (2 vCPU / 8 GiB), 50 GB `pd-balanced`, on-demand |
| Cloud SQL | `…-postgres` | PostgreSQL 17, **ENTERPRISE** edition, `db-g1-small`, 20 GB, ZONAL, private IP only |
| Cloud Storage | `…-warehouse` | Iceberg table data and metadata. Versioning off |
| | `…-artifacts` | Spark scripts and executions. Versioning **on**, 30-day noncurrent expiry |
| | `…-loki` | Log chunks |
| Artifact Registry | `…-spark` | Docker, regional, holds the Spark image |
| Secret Manager | `…-db-password` | Database password, automatic replication |
| Cloud NAT + Router | | `AUTO_ONLY` addresses, all subnets and ranges. Egress only |
| Service Networking | VPC peering | Reserved `/20` for the Cloud SQL private path |
| Cloud Logging | `_Default` | 90-day retention, `SYSTEM_COMPONENTS` only |
| Cloud Audit Logs | 3 services | Data Access logging |

| External ALB | GKE **Gateway** (`gke-l7-global-external-managed`) | Global anycast forwarding rule for customer Web and the IAP-protected control plane; HTTPS only |
| Cloud Armor | `…-trino-lb` | Edge policy attachment; restrictive rules are deferred during M1 |

Trino is private. Use the operator port-forward printed by `terraform output trino_connect_command`:

```bash
kubectl -n celesnity port-forward svc/trino-coordinator 8443:8443 &
trino --server https://localhost:8443 --user celesnity --password --insecure
```

The port-forward needs `--insecure` because the coordinator presents its private self-signed certificate. There is no Trino HTTPRoute or supported public SQL endpoint.

#### Security

**Network.** Nodes have no public IPs and all outbound traffic leaves through Cloud NAT, so nothing is inbound-reachable. GCS and Artifact Registry are reached over Private Google Access rather than the internet. Cloud SQL sets `ipv4_enabled = false` and `ssl_mode = ENCRYPTED_ONLY`. The firewall admits tcp/udp/icmp only from the three internal ranges.

The control plane endpoint is public with **no CIDR allow-list**, a deliberate choice in favour of ADC. IAM plus TLS is therefore the entire control, so keep the set of principals holding `container.developer` or above small.

**Identity.** Workload Identity Federation binds dedicated Kubernetes and Google
service accounts for Core, Web, Control Plane, Agent, Trino, Spark, maintenance,
MCP and streaming roles; no data-plane role inherits another role's cloud
permissions. Kubernetes API token automounting is disabled for workloads that do
not call the API. The node pool uses a dedicated service account rather than the
Compute Engine default. Core's S3-compatible storage client is the remaining
HMAC exception: its key belongs to a non-pod `celesnity-core-storage` identity,
is held in Secret Manager, and is separate from every runtime identity.

**Nodes.** Shielded GKE nodes with secure boot and integrity monitoring; auto-repair and auto-upgrade on.

**Data.** All three buckets enforce uniform bucket-level access and public access prevention, so ACLs are disabled and the buckets cannot be made public. Encryption at rest uses Google-managed keys — CMEK is not configured.

**Application.** Trino uses file-based password authentication with bcrypt cost 10, serves HTTPS on 8443 with a self-signed certificate, shares an `internal-communication.shared-secret` between coordinator and workers, and runs under `access-control.name=read-only`.

**Audit.** Data Access logs (`DATA_READ`, `DATA_WRITE`, `ADMIN_READ`) are enabled on Cloud Storage, Cloud SQL, and Secret Manager, retained 90 days.

> `google_project_iam_audit_config` is **authoritative per service**. Applying it overwrites any audit configuration already set on the project for those three services.

**Retention bounds.** The longest window is 30 days, which is what a documented erasure SLA should be built from — a deletion is not complete while the row still exists in a backup.

| Bound | Value |
|---|---|
| Cloud SQL retained backups | 7 |
| Bucket noncurrent versions | 30 days |
| Loki log retention | 168h (7 days) |
| Iceberg snapshot expiry | via CronJob |

#### Default workloads

The `gcp-dev` overlay renders 12 objects into the `celesnity` namespace.

| Kind | Name | Replicas | CPU request | Memory request |
|---|---|---|---|---|
| Deployment | `trino-coordinator` | 1 | 300m | 1Gi |
| Deployment | `trino-worker` | 1 | 500m | 1Gi |
| Deployment | `spark-master` | 1 | 100m | 384Mi |
| Deployment | `spark-worker` | 2 | 250m | 1Gi |
| CronJob | `iceberg-maintenance` | — | 200m | 512Mi |
| Service | `trino-coordinator`, `spark-master` | | | |
| ConfigMap | 4 (Trino catalog, coordinator, worker, node; maintenance script) | | | |

A `catalog-bootstrap` Job also runs once to seed the Iceberg JDBC schema, since Cloud SQL has no equivalent of Compose's `docker-entrypoint-initdb.d`.

`iceberg-maintenance` runs `expire_snapshots` and `remove_orphan_files` through **Spark, not Trino**, because `access-control.name=read-only` denies `ALTER TABLE EXECUTE`. It runs `local[*]` so it does not depend on cluster health or driver/executor networking.

**Sizing.** A node offers 1930m allocatable CPU. Monitoring and system pods consume roughly 944m, leaving 986m — less than the 1150m the application workloads request. Deploying therefore triggers a scale-up to the second node. CPU is the binding constraint, not memory.

#### Cost

From `make infra-output CLOUD=gcp`:

| Line | USD/month |
|---|---|
| Nodes (2 × `e2-standard-2`) | 120.74 |
| Cloud SQL `db-g1-small` | 32.00 |
| Node disks (2 × 50 GB) | 12.00 |
| External ALB (1 global forwarding rule) | 18.25 |
| Cloud NAT | 5.69 |
| Cloud SQL disk (20 GB) | 4.00 |
| Observability (Loki bucket) | 0.72 |
| GKE cluster fee | **0.00** |
| **Total** | **193.41** |

The load balancer line is a verified rate: the first **five** global forwarding rules cost $0.025/hour *between them*, not each, so one ALB and five cost the same. It excludes $0.008/GiB of data processing each way, and the Cloud Armor policy, whose rate I did not verify. Set `enable_external_lb = false` to drop this line and return to $175.16.

The cluster fee is zero because the $74.40/month free-tier credit covers one zonal cluster. That credit does **not** apply to regional clusters, which is why this is zonal: going regional would both forfeit the credit and triple the node count.

The AWS equivalent of this stack estimates at $292.67.

Levers: `node_spot = true` lands near $117/month at the cost of preemption. Dropping to one node will not hold the current workload set without trimming requests.

Three caveats. The Cloud SQL and GCS rates are **extrapolated from `us-central1`** — the compute, NAT, disk, and GKE rates were verified for `asia-southeast1` but those two were not. The estimate excludes GCS storage, egress, and Cloud Logging. And Data Access logging bills $0.50/GiB beyond 50 GiB free per project per month; Iceberg produces many small GCS metadata reads, so that is the line most likely to surprise you on a first bill.

`db-g1-small` is shared-core and the instance is single-zone, both **excluded from the Cloud SQL SLA**. Acceptable for development; `db-standard-1` is the smallest SLA-covered option.

#### External load balancer

The Trino coordinator is published on the internet through **Gateway API**, not Ingress. Enabled by `enable_external_lb = true`, off by default.

#### Why Gateway API rather than Ingress

On GKE, **every Ingress object provisions its own load balancer** with its own IP and its own certificate. There is no equivalent of the AWS ALB's `group.name` annotation, which is what merges several Ingresses onto one ALB in the AWS overlay. So `a.example.com`, `b.example.com`, and `c.example.com` on **one** address is not expressible with Ingress unless every service is crammed into a single shared Ingress file.

Gateway API splits it along ownership instead:

```text
deploy/overlays/gcp-dev/
├── gateway/gateway.yaml     PLATFORM-owned: one LB, one address, one certificate
└── trino/
    ├── httproute.yaml       SERVICE-owned: hostname + backend
    ├── healthcheckpolicy.yaml
    └── backendpolicy.yaml
```

Adding a service means adding one `HTTPRoute` next to that service. It attaches itself to the existing Gateway and shares the address; nothing platform-owned is touched. That is the whole reason for the migration.

Cross-namespace attachment is restricted **by label, not `from: All`**:

```yaml
allowedRoutes:
  namespaces:
    from: Selector
    selector:
      matchLabels:
        celesnity.io/gateway-access: "true"
```

`All` would let any namespace in the cluster publish itself to the internet through this load balancer just by creating an HTTPRoute. Terraform sets the label on the namespaces it creates, so attachment is deliberate.

#### Security

The shared Gateway publishes only the customer Web and the operator control plane. Trino, Core, Agent, MCP-Trino, and Grafana remain private. Public endpoints use HTTPS; Identity Platform/session authorization protects the customer application, and IAP plus the application `celesnity.com` domain check protects the control plane.

The following controls cover different failures:

| Control | Guards against | Where |
|---|---|---|
| Identity/session authorization | unauthorized customer requests | Web session gateway and Core guards |
| IAP and domain restriction | unauthorized platform operators | control-plane backend and signed-header verification |
| **HTTPS only** | credentials or session data crossing in cleartext | absence of a port 80 listener |
| Cloud Armor | future edge defense in depth | backend policy attachment; restrictive rules deferred in M1 |

HTTPS-only is cleaner here than under Ingress. Ingress served port 80 by default and needed an explicit `allow-http: "false"`; a Gateway exposes only the listeners you declare, and there is exactly one, on 443.

**Cloud Armor is not the M1 authorization mechanism.** The policy is attached through a `GCPBackendPolicy`, but restrictive rules are intentionally deferred. Leaving `lb_allowed_source_ranges` empty means default allow; the application identity controls above must still authorize every request. Terraform reports the current policy state:

```bash
terraform output trino_lb_source_restriction
# "restricted to 1 range(s)"  or  "OPEN TO THE INTERNET - set lb_allowed_source_ranges"
```

If a stable operator or VPN egress range is introduced later, discover its IPv4 address before enabling a source allow-list:

```bash
curl -4 -s https://ifconfig.me     # note the -4: the frontend is IPv4-only
```

Use `-4` because the configured range contract is IPv4. Any future restrictive rule needs rollout and rollback testing before it becomes an availability dependency.

**The address is reserved, not ephemeral.** The certificate has to name the address, and the address is not known until it exists, so reserving it first breaks that circular dependency. An ephemeral address would also change on every recreate and silently invalidate the certificate.

##### Two settings that would otherwise fail silently

Both live in `deploy/overlays/gcp-dev/trino/`:

- **The health check must be HTTPS against `/v1/info`.** By default GCP probes `/` over HTTP on the serving port. Two things then break at once: the port speaks TLS so a plaintext probe fails the handshake, and `/` returns 401 now that password authentication is on. Every backend is marked unhealthy and the load balancer answers 502 with nothing obviously wrong. `/v1/info` is the one endpoint that returns 200 unauthenticated, which is why the readiness probe and the AWS ALB use it too.
- **`appProtocol: HTTPS`** on the Service port in `deploy/base`. This is *not* the same mechanism as Ingress, which used the `cloud.google.com/app-protocols` annotation — Gateway ignores that annotation entirely and reads the standard `ports[].appProtocol` field. Without it the backend service is built as plaintext HTTP against a TLS port, every request dies in the handshake as a 502, and because the health check is a separate resource the backend keeps reporting `HEALTHY` throughout. Verify with `gcloud compute backend-services describe <name> --global --format='yaml(protocol)'`; it must print `HTTPS`.

  It lives in `deploy/base` rather than the overlay for two reasons: it is a plain Kubernetes field rather than a cloud annotation, and **kustomize silently drops it from a strategic-merge patch** because its bundled Service schema does not know the field.

- **No `networking.gke.io/certmap` annotation on the Gateway.** That annotation names a Certificate Manager map and is mutually exclusive with Secret-based `certificateRefs`. Setting it at all, even to an empty string, makes the controller build a reference ending in `/` and the Gateway never programs: `'...certificateMaps/' is not a valid reference`.

`timeoutSec` is raised to 3600 because analytical queries outlive the 30-second default, which would sever the connection mid-result and look like a client-side network fault.

##### `http-server.process-forwarded` is mandatory behind the load balancer

Set in `deploy/base/trino/config/coordinator.properties`. The load balancer appends `X-Forwarded-For`, and Trino **refuses** the request rather than ignoring the header:

```
406 "Server configuration does not allow processing of the X-Forwarded-For header"
```

Every request through the load balancer fails while the identical request over a port-forward succeeds, so it presents as a load balancer fault rather than a Trino setting. It applies to the AWS ALB path too, which is why it lives in `deploy/base`.

It is safe here only because the coordinator Service is ClusterIP, so the load balancer and in-cluster clients are the only routes to 8443. On a directly reachable coordinator this would let a client spoof its apparent source address in the query log.

##### Certificates

Two mutually exclusive mechanisms, selected by `lb_certificate_name`:

| `lb_certificate_name` | Serves | Attached via | Clients |
|---|---|---|---|
| set (current) | Certificate Manager certificate | `networking.gke.io/certmap` | verify normally |
| empty | generated self-signed cert | listener `certificateRefs` | must pass `--insecure` |

Setting both is the failure mode: the Gateway builds an invalid `certificateMap` reference and never programs. Terraform enforces the exclusivity by skipping the self-signed resources whenever a certificate is named, and `terraform output trino_lb_tls_mode` reports which one is live.

**Terraform does not create the certificate**, deliberately. Issuance depends on `_acme-challenge` records in a DNS zone this repo does not manage, and Certificate Manager checks for them **within seconds** of the certificate being created, then backs off for hours after a single failure. Recreating that on every apply would be a liability. Create it once by hand, then set `lb_certificate_name`.

Two consequences of that flow worth knowing:

- **Create the DNS records before the certificate.** If the certificate is created first, the first validation attempt fails with `CNAME_MISMATCH` and the certificate sits in `PROVISIONING` for hours showing a stale error, even after the records appear. There is no way to force a retry — delete and recreate the certificate, which reuses the existing DNS authorizations and records.
- **Leave the `_acme-challenge` CNAMEs in place.** Google-managed certificates re-validate on renewal, so removing them breaks the renewal months later rather than anything visible today.

##### Switching an existing Gateway to a certificate map

This transition cannot be done in place, and the error is opaque:

```
gceSync: client.Patch(...): generic::invalid_argument: In remove mask, field
'ssl_certificates' cannot be successor of field 'resource' with MESSAGE type.
```

The controller has to drop `sslCertificates` and set `certificateMap` on an existing target HTTPS proxy, and the Compute API rejects that field mask. Either recreate the Gateway, or do it directly in two calls, since the two flags are mutually exclusive:

```bash
PROXY=$(gcloud compute target-https-proxies list --format='value(name)' | grep gkegw1)
gcloud compute target-https-proxies update "$PROXY" --global --certificate-map=<map>
gcloud compute target-https-proxies update "$PROXY" --global --clear-ssl-certificates
```

`sslCertificates` takes precedence while it is still set, so the old certificate keeps being served until the second call. Allow **several minutes** for the new certificate to reach the edge after that — the proxy config updates immediately but the served certificate lags. Confirm with:

```bash
echo | openssl s_client -connect <ip>:443 -servername <hostname> 2>/dev/null \
  | openssl x509 -noout -subject -issuer
```

##### If you fall back to self-signed

Remove the `networking.gke.io/certmap` annotation **entirely** rather than blanking it, unset `lb_certificate_name` so Terraform recreates the Secret, and restore the listener's `tls` block. An empty annotation value is not the same as an absent one; it builds a reference ending in `/` and the Gateway never programs.

The self-signed key is deliberately RSA-2048. Google bills self-managed certificates at $0.45 per million connections for RSA-3072 and RSA-4096, and nothing for RSA-2048, ECDSA P-256, or P-384. Raising it would look like hardening and would only add a per-connection charge.

##### Approved hostnames

The M1 public hostnames are `dev.celesnity.com` for the customer application and `control-dev.celesnity.com` for the IAP-protected Celesnity operator console. DNS, the certificate map, and each HTTPRoute hostname must agree. A certificate SAN alone never publishes a service.

Trino intentionally has no public hostname or HTTPRoute. Use the private port-forward documented above. Publishing any additional service requires a separate threat review and an explicit route change.

Gateway API itself can be turned off with `gateway_api_channel = "CHANNEL_DISABLED"` on the cluster module, though there is no cost to leaving the controller installed.

An **internal** Gateway (`gke-l7-rilb`) is the middle option. Unlike the global external class used here, the regional and internal classes require a [`REGIONAL_MANAGED_PROXY` proxy-only subnet](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/internal-load-balance-ingress) in every region, which the `network` module does not create. It also only helps if something already runs in the VPC; from a laptop you would still tunnel.

### How the two clouds map

| Concern | AWS | GCP |
|---|---|---|
| Network | VPC, subnets in 2 AZs | VPC, one subnet + secondary ranges for pods/services |
| Egress | Hand-rolled NAT **instance** | Cloud Router + **Cloud NAT** (managed) |
| Free path to object storage | S3 Gateway VPC endpoint | Private Google Access |
| Cluster | EKS, managed node group | GKE Standard, node pool |
| Database | RDS PostgreSQL, subnet group | Cloud SQL, private IP via VPC peering |
| Object storage | S3 | GCS |
| Registry | ECR | Artifact Registry |
| Workload identity | EKS Pod Identity + agent DaemonSet | Workload Identity Federation, no agent |
| Load balancer | ALB Ingress, `scheme: internal` | Gateway API, external, HTTPS only |
| Many hostnames on one LB | `group.name` annotation merges Ingresses | Gateway API — Ingress cannot do it at all |
| Source restriction | `alb.ingress.../inbound-cidrs` annotation | Cloud Armor policy — no annotation equivalent exists |
| Backend tuning | ALB annotations | `GCPBackendPolicy` + `HealthCheckPolicy` CRDs |
| Backend re-encryption | `backend-protocol` annotation | `ports[].appProtocol` on the Service |
| CSI driver | EBS CSI addon + gp3 StorageClass | Built in, `standard-rwo` default |
| Node arch | arm64 (Graviton t4g) | amd64 (e2) |

Three things are notably simpler on GCP: Cloud NAT is managed rather than an EC2 instance you configure yourself, Ingress and persistent disks need no controller or addon installed, and Workload Identity needs no DaemonSet. The GCP `platform` module is smaller than its AWS twin as a direct result.

One thing is notably more involved: Cloud SQL private IP requires reserving an address range and establishing a VPC peering to a Google-managed project before the instance can be created. RDS just takes subnet IDs.

### Workload identity: the two mechanisms differ in shape

Both give pods short-lived credentials with no keys stored anywhere, but the wiring is inverted.

**EKS Pod Identity** uses one universal trust policy naming `pods.eks.amazonaws.com`, and an `aws_eks_pod_identity_association` names the namespace and ServiceAccount. Nothing is configured cluster-side.

**Workload Identity Federation for GKE** needs agreement in both directions:

1. A Google service account holding the IAM roles.
2. An IAM binding on that service account granting `roles/iam.workloadIdentityUser` to `serviceAccount:<pool>[<namespace>/<ksa>]`.
3. An `iam.gke.io/gcp-service-account` annotation on the Kubernetes ServiceAccount pointing back.

Miss the annotation and pods silently fall back to the node identity; miss the binding and the token exchange is refused. Either way the symptom is a 403 from the metadata server rather than an obvious misconfiguration. This is why the GCP node pool runs a dedicated, minimal service account instead of the Compute Engine default — that default carries project Editor, so a fallback would otherwise succeed and hide the mistake.

### Workload identity on AWS: EKS Pod Identity

No AWS access keys exist anywhere in the AWS path. Four IAM roles — Trino/Spark, the ALB controller, Loki, and the EBS CSI driver — are reachable from the cluster through [EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html), which AWS recommends over IRSA for new EKS clusters.

Two pieces per workload:

1. An IAM role whose trust policy names `pods.eks.amazonaws.com` with `sts:AssumeRole` and `sts:TagSession`. **Identical for every role** — one document, shared from the `cluster` module.
2. An `aws_eks_pod_identity_association` binding that role to exactly one namespace and ServiceAccount.

The association is the security boundary, not the trust policy. A role with no association is unreachable from the cluster, and creating one requires EKS write permission in the account. This is the mental shift from IRSA, where the boundary lived in the trust policy's `sub` condition.

What this replaced, and why it's simpler: there is no IAM OIDC provider, no certificate thumbprint to fetch (the `hashicorp/tls` provider dependency is gone), no per-cluster trust policy edits, and no `eks.amazonaws.com/role-arn` annotations on ServiceAccounts. The same roles would work unchanged against a second cluster.

The one cost is the `eks-pod-identity-agent` addon, a DaemonSet serving credentials from a link-local address — roughly 50 MiB per node, so 0.2 GiB across four. IRSA needed nothing in-cluster.

Ordering matters and is encoded in the module: the agent must be Ready before any pod expects credentials, which is why it's part of the cluster module's `addons_ready` output and why the Loki and ALB controller Helm releases depend on their associations.

If you ever need to run this on EKS Anywhere, ROSA, or self-managed Kubernetes on EC2, Pod Identity is not available there and IRSA would have to come back. It is EKS-only.

### Cost controls worth knowing

These are chosen defaults, not accidents:

- **`cluster_upgrade_policy = "STANDARD"`** refuses extended support. When a Kubernetes version leaves standard support the per-cluster fee goes from $0.10 to $0.60 per hour — roughly $73 to $438 a month, triggered by the calendar alone. STANDARD auto-upgrades instead. The tradeoff is an unscheduled upgrade.
- **`node_cpu_credits = "standard"`** caps burstable CPU cost. EC2 defaults T-family instances to `unlimited`, which bills surplus credits at about $0.04 per vCPU-hour; Spark and Trino will exhaust the 20% baseline. This is why the node group uses a launch template at all — `aws_eks_node_group` cannot set it.
- **The S3 gateway endpoint is free and required.** Without it, all Iceberg warehouse traffic routes through the NAT path.
- **`nat_mode = "instance"`** is about a quarter the cost of a NAT Gateway with no per-GB processing charge — roughly $8/month against $47 in `ap-southeast-1`. Switch to `"gateway"` for production; both terminate at the same route tables, so nothing else changes.

Reduce further with `node_capacity_type = "SPOT"`, `install_alb_controller = false` (use `kubectl port-forward`), or `db_instance_class = "db.t4g.small"`.

## Logging

Container logs flow **Alloy → Loki → Grafana**. Alloy runs as a DaemonSet and tails `/var/log/pods` on each node; Loki runs as a single binary with chunks and index in S3; Grafana ships with the Loki datasource pre-provisioned.

```bash
make obs-status        # Alloy pods, one per node
make grafana-password  # generated admin password
make grafana           # port-forward to http://localhost:3000
```

On GCP, Grafana is intentionally private. Keep `grafana_hostname = ""` and use
`make grafana` or the Terraform `grafana_port_forward_command`; publishing it
through the shared Gateway is outside the M1 trust boundary.

Then query in Grafana's Explore view:

```logql
{app="trino", component="worker"}          # all Trino worker logs
{app="spark", stream="stderr"}             # Spark errors only
{namespace="celesnity"} |= "OutOfMemory"   # full-text across the stack
```

Labels come from the `app.kubernetes.io/*` labels the Trino and Spark manifests already set, plus `namespace`, `pod`, `container`, `node`, and `stream`. The label set is kept deliberately small: every distinct combination is a separate Loki stream, and stream count is what makes Loki slow.

### Capacity: read this before enabling

Memory is the binding constraint here, not cost. Four `t4g.medium` nodes give roughly **12.7 GiB allocatable**. With one Trino worker and one Spark worker:

| | Memory limits |
|---|---|
| Trino coordinator + 1 worker | 3.0 GiB |
| Spark master + 1 worker | 1.9 GiB |
| System (CNI, kube-proxy, CoreDNS, ALB controller, EBS CSI) | ~1.5 GiB |
| Pod Identity Agent DaemonSet (~50Mi × 4 nodes) | 0.2 GiB |
| **Subtotal** | **~6.6 GiB** |
| Alloy DaemonSet (256Mi × 4 nodes) | 1.0 GiB |
| Loki single binary | 0.5 GiB |
| Grafana | 0.3 GiB |
| **Total** | **~8.4 GiB** |

That leaves about 4.3 GiB of headroom, which is comfortable. No extra node is needed.

Two things to watch as you grow:

- **Each additional Trino worker costs 1.5 GiB** and needs `TRINO_QUERY_MAX_MEMORY` raised to match — it is the aggregate budget across workers, so two workers means 1200MB. Each Spark worker costs 1.25 GiB.
- **Per-node limits still bind.** Nothing schedulable can exceed roughly 2.8 GiB, because Kubernetes does not pool memory across nodes. The cluster total having headroom does not mean a single large pod will fit.

If you would rather not run Loki and Grafana in-cluster at all, set `install_loki = false`, `install_grafana = false`, and point `loki_write_endpoint` at a Grafana Cloud push URL. Only Alloy stays, dropping the logging footprint from 1.8 GiB to 1.0 GiB. The free tier covers 50 GB/month with 14-day retention.

### Two chart defaults that would have broken this

Worth knowing if you tune the values yourself:

- The Loki chart defaults `chunksCache.allocatedMemory` to **8192 MiB** and `resultsCache` to 1024 MiB, both enabled. That single memcached exceeds an entire `t4g.medium`. Both are disabled in `helm.tf`.
- The chart defaults `deploymentMode` to `SimpleScalable`, which spreads read/write/backend across separate Deployments. This uses `SingleBinary` with the other replica counts zeroed.

### Cost

Loki stores in S3 rather than on an EBS volume: roughly a quarter the per-GB cost of gp3, and log history survives pod rescheduling. Traffic goes through the free gateway endpoint, so none of it touches NAT. At PoC volumes expect well under $1/month for storage.

Two ingest controls are on by default. `drop_healthcheck_logs` discards probe lines — Trino and Spark readiness probes fire every 10 seconds per pod and dominate volume on an idle cluster. `log_namespaces` restricts collection to the application namespaces; adding `kube-system` roughly doubles volume for little debugging value. Retention defaults to 7 days (`loki_retention_hours = 168`), enforced by the Loki compactor with an S3 lifecycle rule as backstop.

## Checks

```bash
make validate-all                   # GCP development and production
make validate CLOUD=gcp ENV=dev     # development checks
make validate CLOUD=gcp ENV=prod    # production checks
make render   CLOUD=gcp ENV=prod    # render production manifests without applying
make infra-fmt           # terraform fmt across all modules and environments
```

`make lint-alloy` renders the Alloy pipeline through Terraform and runs `alloy validate` against it, which checks component and argument names against the real Alloy schema rather than just parsing. It needs `brew install grafana-alloy`.

`make render` and `make lint-manifests` pass `--load-restrictor LoadRestrictionsNone` to kustomize. That is required because `deploy/base` reads `config/trino/` from outside its own directory, which is the mechanism behind the shared configuration. Use the Make targets rather than calling `kubectl kustomize` directly.

## Security posture

The supported targets are not hardened equally. Production GCP is the strongest configuration; local is development-grade. The retained AWS modules have no deployable environment.

**Local and retained AWS reference modules**

- **No Trino authentication and no TLS.** The Ingress defaults to `scheme: internal` for this reason. An internet-facing ALB would publish an unauthenticated SQL engine with read access to the whole warehouse; the read-only access control blocks writes, not reads.
- **`cluster_endpoint_public_access_cidrs` defaults to `0.0.0.0/0`.** The Kubernetes API is protected by IAM and TLS but reachable from anywhere. Narrow it in `terraform.tfvars`.
- **Replace the local development credentials** in `local/.env` before sharing an environment.

**GCP**

- **Core, Agent, Trino, MCP-Trino, and Grafana are private.** Only the customer Web and IAP-protected control plane have HTTPRoutes. Trino's self-signed listener is used in-cluster and through approved operator port-forwards.
- **The load balancer serves a verifiable Google-managed certificate** for the two approved public Web hostnames.
- **Restrictive Cloud Armor rules are deferred.** The current default-allow edge policy is not counted as an authentication or authorization control; enable a reviewed rule set only with availability and rollback evidence.
- **The GKE control plane has no CIDR allow-list.** This was chosen in favour of ADC access. IAM and TLS are the only controls, so audit who holds `container.developer` or above on the project.
- **No CMEK.** Encryption at rest uses Google-managed keys. Cloud SQL, GCS, and persistent disks all support customer-managed keys if key control or a documented crypto-shredding path is needed.
- **Production data residency is `europe-west2` (London).** Development remains
  in Singapore and must not receive production personal data. Cloud SQL and GCS
  locations are immutable, so confirm the production project and region before
  the first apply.
- **`db-g1-small` is shared-core and single-zone**, so the instance carries no Cloud SQL SLA.

**All targets**

- **Terraform state contains the database password.** State is gitignored; move to an encrypted remote backend (commented in `versions.tf`), or switch to the External Secrets Operator.
- **Grafana has no public route.** Its admin password is generated into the `grafana-admin` Secret rather than being a known default, and `make grafana` or an explicit Kubernetes port-forward is the supported operator path.
- **Retention is bounded on GCP but not on AWS.** The GCP stack caps Cloud SQL backups at 7, bucket noncurrent versions at 30 days, and Loki at 7 days, and expires Iceberg snapshots on a schedule. The AWS path keeps one day of RDS backups and has no S3 lifecycle rule.

## References

- [Trino Iceberg connector](https://trino.io/docs/current/connector/iceberg.html)
- [Apache Spark standalone mode](https://spark.apache.org/docs/3.5.7/spark-standalone.html)
- [Amazon EKS Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)
- [Amazon EKS pricing](https://aws.amazon.com/eks/pricing/)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [Choose a Cloud SQL edition](https://docs.cloud.google.com/sql/docs/postgres/choose-edition)
- [Workload Identity Federation for GKE](https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity)
- [GKE pricing and the free tier credit](https://cloud.google.com/kubernetes-engine/pricing)
- [Cloud Audit Logs overview](https://cloud.google.com/logging/docs/audit)

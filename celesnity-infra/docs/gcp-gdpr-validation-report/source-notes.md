# Source notes: GCP architecture feedback and GDPR readiness

Snapshot date: 2026-08-16 (Asia/Ho_Chi_Minh).

## Scope and method

This assessment combines four evidence layers:

1. The Google Customer Engineer feedback supplied by the user.
2. The checked-in `celesnity-infra`, `celesnity-core`, and `celesnity-web` deployment and application configuration on their current local branches.
3. Read-only live checks against the configured `celesnity-gcp-dev` GKE cluster and Cloud SQL instance.
4. Primary or authoritative sources: the GDPR text on EUR-Lex, EDPB guidelines, and official Google Cloud documentation and contractual terms.

It is an engineering and compliance-readiness assessment, not a legal opinion or certification.

## Live observations

- GKE cluster: zonal, `asia-southeast1-a`, private nodes, Workload Identity Federation enabled, GKE version `1.35.6-gke.1258000`.
- Nodes observed: two `e2-standard-2` nodes plus one `n2-standard-4` node used by streaming workloads. All three are in the same zone.
- No Kubernetes `NetworkPolicy` resources were present.
- Managed Prometheus was not enabled. GKE system-component logging was enabled; workload logging was not enabled through GKE.
- Celesnity API, web, execution worker, Spark master/worker, Trino coordinator/worker, MQTT Bronze stream, Redpanda Connect, Loki, Grafana, EMQX, and Redpanda were running. Several stateful or coordinating components had a single replica.
- Cloud SQL was PostgreSQL 17, `db-g1-small`, zonal, private-IP-only, `ENCRYPTED_ONLY`, with seven retained backups and PITR disabled.
- The effective resource-location organization-policy query did not show an EU allow policy.

## Repository evidence

- `celesnity-infra/infra/environments/gcp-dev/terraform.tfvars.example`: Singapore region, zonal cluster, two `e2-standard-2` default nodes, relaxed deletion controls for development, and 7-day Loki retention.
- `celesnity-infra/infra/modules/gcp/cluster/main.tf`: private nodes, Workload Identity Federation, Managed Prometheus disabled, system-only Cloud Logging, one autoscaled default node pool.
- `celesnity-infra/infra/modules/gcp/platform/iam.tf`: one `celesnity` Kubernetes service account maps to one Google service account with `storage.objectAdmin` and bucket-reader access on both warehouse and artifact buckets.
- `celesnity-web/k8s/base/deployment.yaml` and `celesnity-core/k8s/base/api.yaml`: web and API both run as the shared `celesnity` Kubernetes service account; service-account tokens are not explicitly disabled.
- `celesnity-core/k8s/overlays/gcp-dev/configmap.yaml`: application authentication is disabled; Cloud Armor source allow-listing is explicitly acknowledged as not being user authentication.
- `celesnity-web/cloudbuild.yaml`: the public Core API URL is supplied as a Next.js build argument and therefore makes the frontend image environment-specific.
- `celesnity-core/cloudbuild.yaml`: application secrets are fetched during deployment and substituted into a Kubernetes Secret manifest. They are not compiled into the container image, but they do pass through the Cloud Build workspace and are stored as Kubernetes Secrets.
- `celesnity-core/src/infrastructure/prisma/schema.prisma`: tenant scoping exists for MQTT adapters but not for connections, scripts, pipelines, executions, or SQL executions. SQL text, errors, connection metadata, logs, and graph/artifact metadata can contain or point to personal data.
- `celesnity-infra/infra/modules/gcp/data/sql.tf`, `storage.tf`, `audit/main.tf`, and the Iceberg maintenance manifests: backups, noncurrent artifact versions, logs, and Iceberg snapshots have useful technical retention bounds. Application metadata rows do not have a comprehensive purpose-based retention/deletion workflow.

## Primary legal and regulatory sources

- GDPR consolidated text: https://eur-lex.europa.eu/eli/reg/2016/679/ojv
- EDPB Guidelines 07/2020 on controller and processor concepts: https://www.edpb.europa.eu/documents/guideline/guidelines-072020-on-the-concepts-of-controller-and-processor-in-the-gdpr_en
- EDPB Guidelines 05/2021 on GDPR territorial scope and international transfers: https://www.edpb.europa.eu/documents/guideline/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and-the_ga

Key interpretation used in the report:

- Celesnity is likely a processor for customer datasets handled on customer instructions, while being a controller for its own account, security, billing, and product telemetry data. The contracts and product architecture must support both roles.
- EU-only hosting is not, by itself, a GDPR requirement or proof of compliance. It is a strong risk-reduction and customer-contract measure. Transfers and remote access from outside the EEA still need a Chapter V analysis and safeguards where applicable.
- Article 30 records of processing are structured records of purposes, data subjects/categories, recipients, transfers, erasure periods, and security measures. Cloud audit logs are evidence inputs, not a substitute for the record.
- Article 33 governs personal-data-breach notification. Observability and audit trails support detection and investigation, but do not themselves satisfy the notification process.
- Article 32 requires risk-appropriate security, resilience, restoration ability, and regular testing. High availability is therefore relevant where loss of availability would risk individuals, but regional GKE is not a standalone GDPR checkbox.
- Article 17 erasure is qualified by its grounds and exceptions. Backups may be handled through documented isolation and bounded expiry; the application still needs to erase or render unavailable the live and derived copies it controls.

## Official Google Cloud sources

- Regional GKE clusters: https://docs.cloud.google.com/kubernetes-engine/docs/concepts/regional-clusters
- GKE NetworkPolicy: https://docs.cloud.google.com/kubernetes-engine/docs/how-to/network-policy
- GKE Dataplane V2: https://docs.cloud.google.com/kubernetes-engine/docs/how-to/dataplane-v2
- GKE RBAC best practices: https://docs.cloud.google.com/kubernetes-engine/docs/best-practices/rbac
- Workload Identity Federation for GKE: https://docs.cloud.google.com/kubernetes-engine/docs/concepts/workload-identity
- Secret Manager managed CSI component: https://docs.cloud.google.com/secret-manager/docs/secret-manager-managed-csi-component
- Restrict resource locations: https://docs.cloud.google.com/organization-policy/restrict-locations
- Services supporting resource-location restrictions: https://docs.cloud.google.com/organization-policy/reference/restrict-locations-supported-services
- Cloud Logging storage and default retention: https://docs.cloud.google.com/logging/docs/store-log-entries
- Google Cloud GDPR resources: https://cloud.google.com/privacy/gdpr
- Google Cloud Data Processing Addendum: https://cloud.google.com/terms/data-processing-addendum

## Important corrections to the supplied feedback

- The live cluster no longer consists only of two `e2-standard-2` nodes; a third `n2-standard-4` streaming node is present. It is still entirely zonal.
- The claim that all secrets are injected at image build time is inaccurate. The Core images are immutable with respect to runtime secrets; Cloud Build performs deployment-time Secret substitution. The Next.js public API URL is genuinely embedded at build time.
- The API and web use the shared workload identity, but the API reaches GCS using long-lived HMAC credentials rather than Workload Identity. This creates two separate credential/blast-radius problems.
- NetworkPolicy can be enabled on an existing Standard cluster using a supported plugin, although node recreation/disruption is involved. Dataplane V2 is best treated as a new-cluster decision for the planned regional EU production cluster.
- Cloud Logging `_Default` retention is 30 days by default, not 90. This project configures 90 days explicitly for `_Default`; only the selected log classes are routed there.
- A Next.js BFF is one valid design, not the only compliant design. A same-origin gateway route plus OIDC/IAP and private internal service routing can achieve the same security objective.
- A GPU/TPU pool is not justified by the current manifests. Add it only after an identified training workload, data classification, capacity profile, and cost model exist.
- Spot VMs are suitable for interruption-tolerant Spark executors/jobs, not automatically for Trino coordinators, Spark masters, Redpanda, or other stateful/interactive components.
- EU resource-location organization policy is useful but applies only to supported resources and is not retroactive. It must be paired with service-specific data-location configuration, contracts, transfer assessment, and operational-access controls.

## Report structure mapping

- Technical summary: `The feedback is directionally right, but production must be rebuilt around identity, tenant isolation, and data lifecycle`.
- Key findings: feedback validation matrix and GDPR readiness matrix.
- Scope, data, and definitions: `GDPR applies to processing roles and data flows, not to a cloud-region checkbox`.
- Methodology: `How this assessment was validated`.
- Limitations and robustness: `What this assessment does not establish`.
- Recommended next steps: combined priority matrix and phased delivery gates.
- Further questions: `Decisions that must be made before implementation`.

The report includes one small bar chart counting roadmap actions by delivery phase because the portable report contract requires visual evidence. It is a planning-composition view, not a risk score or compliance metric. The exact action table remains the authoritative evidence.

The reviewed table rows were materialized into `evidence.sqlite` from the canonical artifact snapshot and queried back in their report column order. The chart groups the reviewed action table by priority. The exact queries are stored in the report source metadata.

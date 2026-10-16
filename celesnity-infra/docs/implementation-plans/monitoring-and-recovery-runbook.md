# Monitoring and recovery evidence runbook

Status: implementation-ready. Operational closure requires a verified paging
destination and successful production-like rehearsals.

## Service objectives

Initial targets for the first production release:

- public Web availability SLO: 99.5% over a rolling 30 days;
- alert detection: two failing probe locations sustained for two minutes;
- platform incident acknowledgement target: 15 minutes;
- Cloud SQL RPO: five minutes when PITR is enabled;
- service RTO: four hours until a measured rehearsal supports a tighter value.

These are operating targets, not measurements. Record actual probe coverage,
backup timestamps, acknowledgement time, restore duration and validation time.

## Unified observability stack

Grafana is the single operator UI:

- Google Managed Service for Prometheus stores application RED metrics and the
  curated GKE metrics used for USE analysis;
- Alloy tails Kubernetes container logs and sends them to GCS-backed Loki;
- the provisioned **Celesnity platform overview** dashboard queries both data
  sources, so a latency or error spike can be investigated beside its logs;
- Grafana authenticates to Cloud Monitoring through Workload Identity and
  `roles/monitoring.viewer`. There is no service-account key;
- Grafana remains a private `ClusterIP`. Reach it through an authenticated
  Kubernetes session and port-forward rather than a public route.

Core and Agent publish `/metrics` internally. Their `PodMonitoring` resources
scrape every 30 seconds and NetworkPolicies admit the `gmp-system` collectors.
HTTP labels use route templates rather than raw URLs, preventing customer IDs,
execution IDs, and other high-cardinality values from becoming metric labels.
The curated package list intentionally omits control-plane, StatefulSet, and
DaemonSet metric packages until a dashboard or alert consumes them; this keeps
sample ingestion lower while retaining pod CPU, memory, restart, deployment,
and HPA signals.

The initial dashboard covers:

- RED: request rate, 5xx percentage, and p95 response duration;
- USE: pod CPU, working-set memory, and container restarts;
- logs: the namespaces for Web/Core, Agent, and monitoring workloads.

Deploy in this order so application manifests never reference an absent
`PodMonitoring` CRD:

1. deploy `celesnity-infra` to enable managed collection and update Grafana;
2. deploy `celesnity-core` and `celesnity-agent` to expose and register RED
   metrics;
3. allow two to five minutes for the first time series to become queryable.

### Operator access and verification

```bash
kubectl -n MONITORING_NAMESPACE port-forward svc/grafana 3000:80
kubectl -n WORKLOAD_NAMESPACE get podmonitoring celesnity-core
kubectl -n AGENT_NAMESPACE get podmonitoring celesnity-agent
kubectl -n gmp-system get pods
```

Open `http://localhost:3000`, select **Dashboards > Celesnity > Celesnity
platform overview**, and verify these PromQL queries in Explore:

```promql
sum by (service) (rate(http_server_requests_total[5m]))
histogram_quantile(0.95, sum by (service, le) (rate(http_server_request_duration_seconds_bucket[5m])))
sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[5m]))
```

Verify logs in the same time window with:

```logql
{namespace=~".+"}
```

If a RED panel is empty, inspect the `PodMonitoring` status and collector logs
before changing the query. If only USE panels are empty, confirm the cluster's
`monitoring_config.enable_components` includes the corresponding curated GKE
package. An empty panel immediately after deployment is expected until the
first samples are ingested.

## Monitoring activation

1. Set `monitoring_notification_email_addresses` to the verified on-call
   destination; an empty set deliberately creates policies without paging.
2. Apply Terraform and verify the email notification channel.
3. Confirm the HTTPS uptime check passes from multiple locations and validates
   the certificate.
4. Test paging in an approved window, acknowledge the incident, and retain the
   alert URL, timestamps and responder.

## Cloud SQL recovery rehearsal

Use a new disposable target; never restore over production.

```bash
scripts/recovery/cloud-sql-pitr-rehearsal.sh plan PROJECT SOURCE TARGET 2026-09-03T00:00:00Z

export RECOVERY_CONFIRM='CREATE TARGET FROM SOURCE IN PROJECT'
scripts/recovery/cloud-sql-pitr-rehearsal.sh execute PROJECT SOURCE TARGET 2026-09-03T00:00:00Z
```

After the clone completes, connect through the private, loopback-only access
path. Validate migration state, tenant row counts, the latest committed marker,
catalog ownership, and audit continuity. Record the measured RPO and RTO. Delete
the disposable target only after Security/Platform accept the evidence.

## Zone and failover rehearsal

For production HA Cloud SQL, invoke a planned failover in an approved window,
measure application error rate and recovery time, and verify no tenant context
or audit events were lost. For GKE, cordon and drain one node in one zone, then
verify PodDisruptionBudgets keep Web, Core, Trino and Spark control-plane
components available. This runbook does not automate either disruptive action.

## Exit gate

Monitoring/recovery closes only when notification delivery, uptime alerting,
Cloud SQL PITR restore, database failover, single-zone/node loss, and application
smoke tests have timestamped, hashed evidence with an assigned owner.

# Discord service error alerts

The GCP observability module provisions five Grafana rules: Core API 5xx
responses, Core worker errors, Web backend proxy transport failures, Agent
HTTP 5xx exceptions or failed runs, and Agent tool failures (including failed
tool steps within completed runs).
Alloy already sends the selected Kubernetes logs to Loki.
Grafana evaluates each rule every 30 seconds over a five-minute window and
groups Discord notifications by service. The notification group wait and
interval are 30 seconds, so a new failure can update an active group at the
next 30-second check. Log ingestion, evaluation, and delivery add latency; this
is not a guaranteed 30-second delivery time. No-data is normal; a query
failure alerts.

## Prepare the webhook

Create a Discord webhook for a restricted operations channel. Use its ordinary
URL, **without `/github`** (that suffix is only for GitHub's native webhook
integration). Store the URL in Google Secret Manager in the target GCP project.
Do not put the URL in Terraform variables, `.tfvars`, Git, or a shell command
argument.

Before enabling the rules, copy the secret value into a Kubernetes Secret in
the target cluster's monitoring namespace. Set `PROJECT_ID`, `KUBE_CONTEXT`,
and `MON_NS` for the intended environment first. The live development namespace
was `monitoring` and the live production namespace was
`celesnity-prod-monitoring` when checked on 2026-09-27; verify these against
the cluster and `monitoring_namespace` Terraform input before applying.

```sh
set -o pipefail
gcloud secrets versions access latest \
  --secret=celesnity-discord-errors \
  --project="$PROJECT_ID" \
  | kubectl --context "$KUBE_CONTEXT" -n "$MON_NS" create secret generic grafana-discord-webhook \
      --from-file=DISCORD_WEBHOOK_URL=/dev/stdin \
      --dry-run=client -o yaml \
  | kubectl --context "$KUBE_CONTEXT" apply -f -
```

Use a separate webhook and secret for development and production. The Helm
chart imports the Kubernetes Secret as the Grafana process's
`DISCORD_WEBHOOK_URL` environment variable. Grafana expands that variable in
the provisioned Discord contact point at startup. Rotate the Secret Manager
version, repeat the sync, and restart Grafana to apply a new URL.

## Enable and verify

Set `enable_error_alerts = true` for the intended GCP environment and apply
the normal infrastructure release process. It defaults to `false` until the
webhook Secret exists. The module provisions the
`celesnity-discord-errors` contact point and directs only these five rules to
it; it does not replace Grafana's global notification policy.

1. In Grafana, check that the Discord contact point and five rules appear and
   that all rules are healthy. Use the contact point's **Test** action.
2. In Explore, run each rule's LogQL query from
   `infra/modules/gcp/observability/error-alerts.tf` against actual development
   logs. Confirm the app and component labels match the deployed pods.
3. Produce one controlled, non-sensitive 5xx or transport failure in development.
   Check the log in Loki, the rule's firing state, the Discord message, and the
   resolved notification. Check that a corresponding 4xx does not fire.
4. Repeat the preflight in production before enabling its flag.

Agent tool failure messages include the tool name, run ID, UTC occurrence time,
and a Grafana Explore link filtered to that run's failure logs. The link opens
the last seven days and requires Grafana access. Raw tool output and error text
stay in Loki, because they may contain query or customer data. Each structured
failure has its own alert instance, identified by tool, run ID, and occurrence
time. Multiple active instances can still appear in one service notification;
the 30-second interval controls group updates, not one Discord message per
occurrence. The 4-hour repeat interval only applies when a group has no changes.

The other four rules include a protected Grafana Explore link filtered to
matching service errors, but still report aggregate counts rather than a
specific request ID or error. Core and Web already log request IDs; their
aggregate alerts do not extract those IDs yet. Core worker logs are mostly
free-form, so their alert cannot reliably name a single failed job. Core
worker matching is based on the existing Nest `ERROR` log marker and should
be tuned against live logs before production activation.

## Reuse for new APIs and services

The five rules are generated from `error_alert_specs` in
`infra/modules/gcp/observability/error-alerts.tf`. This single rule template
owns the evaluation window, Discord receiver, grouping, severity, expression
pipeline, and protected Explore link. To monitor another service, add one
query and log filter to `error_alert_queries`; the rule and link are generated
from it. Keep request IDs, paths, error text, and other high-cardinality values
in the log line or query-time labels, not Kubernetes or Loki stream labels.

| New failure source | Existing collection path | Alert work needed |
| --- | --- | --- |
| Core HTTP API route | Global `createHttpRequestLoggingMiddleware` records every completed request and its status | None for 5xx responses |
| Web API path under `/api/core` or `/api/agent` | Existing catch-all proxy routes use `logProxyTransportFailure` for upstream transport failures | None for transport failures; an upstream 5xx is reported by Core or Agent, not by the Web proxy rule |
| Standalone Web route | No global server-side error logger covers every route | Emit a structured, safe failure event and add its selector to the Web alert |
| Agent HTTP route | Global `ApiExceptionFilter` logs 5xx exceptions | None for exceptions; a manually returned 5xx needs its own log event |
| Agent tool | `RuntimeRunManager` records each `tool_result` with `is_error=true` through `writeAgentToolFailureDebug` | None for new tools using that event contract |
| Core background job | Worker rule matches `ERROR` log lines | It alerts generically; structured job ID and event logging is needed for per-job details |

For per-occurrence Discord details like the Agent tool rule, log a stable
non-sensitive event name, occurrence time, and safe request/run/job ID; then
add a query that extracts those fields into query-time labels. The Discord
message should contain identifiers and a protected log link, never raw error
text or payloads. Confirm the new selector against actual Loki logs before
enabling it in production.

The Grafana Helm chart runs Helm's `tpl` over alert provisioning files before
Grafana reads them. Wrap Grafana notification and annotation templates, and
Loki `line_format` templates, in Helm raw-string escapes as shown in
`helm.tf` and `error-alerts.tf`. Terraform validation cannot detect an
unescaped template. Render the pinned Grafana chart with both provisioning
files and confirm the Grafana and Loki placeholders remain intact before
applying a template change.

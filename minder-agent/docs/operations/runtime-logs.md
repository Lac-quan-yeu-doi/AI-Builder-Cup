# Tracing a chat run in development

The existing Alloy DaemonSet collects Kubernetes container logs into Loki. Use
Grafana Explore or `kubectl logs` with a Web `X-Request-Id` or an Agent `runId`.
These identifiers remain JSON fields, never Loki index labels. A browser send
passes the request ID through Web to Core and Agent; Core's assertion exchange
uses the same ID. A run can outlive its HTTP request, so follow the run ID for
later provider and tool events.

Examples for Grafana Explore (replace the quoted identifier):

```logql
{app="celesnity-web"} |= "request-id-here"
{app="celesnity-core"} |= "request-id-here"
{app="minder-serve"} |= "request-id-here"
{app="minder-serve"} |= "run-id-here" | json
```

Agent emits one JSON line for run start and terminal summary, each model stream,
and each completed tool action. `agent_provider_request_failed` records the
provider HTTP status and a bounded error category. `agent_run_summary` records
the final status, elapsed time, event counts, and failure stage. It does not
log prompts, model responses, tool arguments/results, owner identity, or API
keys. The exact provider error remains in the owner-authorized durable run
record; inspect that record when the category is insufficient.

Web logs `agent_proxy_request_*`, `agent_proxy_stream_closed`,
`core_proxy_stream_*`, and policy failures. Core logs ordinary HTTP completion
and `message_block_stream_*` admission, error, and close reasons. A normal
rotation closes as 200; navigation and gateway disconnection can close as 499.
For suspected gateway timeouts, compare Core's close duration with the Google
Cloud load-balancer `statusDetails` and backend service. A repeated 30-second
`backend_timeout` means the dedicated 300-second stream route is not active.

Log records are bounded and exclude payloads. Loki's ingestion limit can drop
bursts, so the persisted run event journal and run status remain authoritative
for execution outcomes. No new log source or high-cardinality label is needed.

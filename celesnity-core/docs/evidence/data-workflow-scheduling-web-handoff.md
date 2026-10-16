# Data Workflow scheduling Web handoff

Core exposes Calendar and Interval scheduling for published Data Workflows. The
canvas remains a Web responsibility. Watch Source, CDC, source polling, and
customer-network agents are not available trigger options.

All endpoints below require the existing `PIPELINES` workspace feature and the
workflow authorization enforced by Core. The API prefix is environment-owned.

## Draft and publication

`POST /data-workflows` and `PATCH /data-workflows/:id` accept the existing
`draft.graph` contract. Its single `TRIGGER` node is one of:

```json
{ "id": "trigger", "type": "TRIGGER" }
{ "id": "trigger", "type": "TRIGGER", "config": { "type": "CALENDAR", "expression": "0 7 * * 1", "timezone": "Asia/Ho_Chi_Minh" } }
{ "id": "trigger", "type": "TRIGGER", "config": { "type": "INTERVAL", "everySeconds": 600, "anchorAt": "2026-09-18T00:00:00.000Z" } }
```

Calendar expressions have exactly five fields and require an IANA timezone.
Intervals have a minimum `everySeconds` of 10 and a UTC anchor. Invalid input
is rejected as `400 WORKFLOW_GRAPH_INVALID`. A config-less node remains the
backward-compatible manual-only trigger. Publication remains
`POST /data-workflows/:id/versions` with `{ "expectedRevision": number }`.
Published version responses retain the immutable `trigger` snapshot.

## Schedule state and pause

`GET /data-workflows/:id/schedule` returns:

```json
{
  "kind": "CALENDAR | INTERVAL | MANUAL",
  "lifecycle": "ENABLED | PAUSED | MANUAL",
  "enabled": true,
  "paused": false,
  "nextDueAt": "2026-09-19T07:00:00.000Z",
  "occurrenceCoverage": {
    "coalescedCount": 0,
    "coalescedFromAt": "optional UTC instant",
    "coalescedThroughAt": "optional UTC instant"
  }
}
```

The existing `PATCH /data-workflows/:id/state` accepts
`{ "expectedRevision": number, "paused": boolean }` and now includes this
same `schedule` object in its workflow response. Pause changes only automatic
scheduling; the existing manual `POST /data-workflows/:workflowId/runs` route
continues to be available.

Schedule state intentionally excludes schedule actor identity, lease values,
run parameters, delegation, and source data.

## Calendar preview

`POST /data-workflows/:id/schedule/preview` accepts:

```json
{ "source": "DRAFT | PUBLISHED", "count": 1 }
```

Both properties are optional: source defaults to `DRAFT`, count defaults to 5,
and count is bounded to 1 through 20. The response contains the selected source,
the calendar expression/timezone, and UTC occurrence strings. It is only valid
for a Calendar trigger. Core maps malformed or unavailable schedules to its safe
workflow validation/not-found errors and does not expose cron-parser messages.

## Web implementation notes

Show a trigger panel on the data-workflow canvas with Manual, Calendar, and
Interval choices. Before publish, call preview with `source: "DRAFT"`; after
publish, offer `source: "PUBLISHED"` when comparing the live schedule. Render
`nextDueAt`, lifecycle, and coalescing coverage from the schedule endpoint.
Use the state endpoint response immediately after pause/resume, then refresh the
workflow list as needed. Do not render a Watch Source/CDC option until its
separate backend capability is delivered.

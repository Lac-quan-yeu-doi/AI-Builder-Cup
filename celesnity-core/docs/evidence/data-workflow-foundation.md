# Data Workflow foundation evidence

## Delivered API

All data-workflow routes use the existing `PIPELINES` workspace feature gate and
explicit authorization. The delivered contract is:

```text
POST   /data-workflows
GET    /data-workflows?page=&pageSize=
GET    /data-workflows/:id
PATCH  /data-workflows/:id                         { expectedRevision, draft }
POST   /data-workflows/:id/versions                { expectedRevision }
GET    /data-workflows/:id/versions?limit=
PATCH  /data-workflows/:id/state                   { expectedRevision, paused }
POST   /data-workflows/:workflowId/runs            { parameters }
GET    /data-workflows/:workflowId/runs?limit=
GET    /data-workflows/:workflowId/runs/:runId
POST   /data-workflows/:workflowId/runs/:runId/retries
                                                     { nodeId, expectedRevision, acknowledgeWriteRisk }
```

Run creation returns `{ runId, status: 'QUEUED' }`. Public run history exposes
only run status and scrubbed node-attempt execution links; it excludes
parameters, delegation, source rows, and execution error detail.

## Disposable PostgreSQL proof

`npm run test:data-workflow:integration` invokes
`scripts/run-data-workflow-integration.mjs`. It fails before any database action
unless `DATA_WORKFLOW_INTEGRATION_DATABASE_URL` is PostgreSQL on a loopback host,
names exactly `celesnity_data_workflow_foundation_test`, and includes
`schema=celesnity_app`. After validation it creates only that database from
`template0`, deploys migrations, runs the dedicated Jest config, and drops that
same database in `finally`.

The enabled scenario uses concrete Prisma workflow repositories, execution rows,
and outbox records to prove author -> publish -> Run now -> parallel A/B -> join
-> C -> complete. It initializes its controlled clock from the live time at test
startup, so PostgreSQL's lease fence treats the initial lease as valid. It then
injects a one-shot response-loss fault only after the underlying adapter has
committed the execution, outbox event, and node-attempt association. A new lease
reclaims that run and confirms the same C execution association remains, with no
second execution or `Execution` outbox row. The scenario also fences the stale
lease after recovery, refuses cross-tenant reads, rechecks a revoked membership
in background context, and rejects retry while a node may still write.

No live execution IDs are recorded: no disposable PostgreSQL URL was configured
for this checkout, so the suite skipped without contacting a database.

| Command                                                                  | Outcome                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `npx jest --config jest.data-workflow-integration.config.ts --runInBand` | Skipped safely because the URL was unset.                        |
| `npm run test:data-workflow:integration`                                 | Requires the explicit disposable URL; otherwise it fails closed. |

## Handoff and limits

Calendar, interval, watch-source polling, CDC, customer agents, and the workflow
canvas/UI are outside this foundation. Spark/Iceberg is also not claimed without
separately configured disposable source/target fixtures and a local runtime. The
controlled integration executor persists execution and outbox rows but never
submits Spark, so it proves orchestration durability only.

Scheduling/UI work should create the same durable run records and retain the
published-version, authorization-recheck, lease-fence, and node-attempt
association contracts described above.

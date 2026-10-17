/**
 * Phase 3 — the data platform behind Demo Data 2 (coffee capsules): crawl → map → process.
 *
 *   1. the Iceberg database `demo2_coffee_capsules`;
 *   2. the Postgres connection to schema `demo2_coffee_capsules` in the compose
 *      `sample-postgres` service (shared with Demo Data 1), tested;
 *   3. the metadata crawler, run to completion — its namespace/relation ids are
 *      REQUIRED by every POSTGRES_SOURCE node;
 *   4. one mapping pipeline per curated table (SAP / SCADA / historian names →
 *      canonical), plus the weather APPEND into `fact_signal`;
 *   5. the derived tables (OEE, material balance, forecast, health, humidity
 *      risk, plant-model lookups) — CREATE_NEW "derive_*" pipelines, built one at
 *      a time in dependency order;
 *   6. "refresh_*" twins (EXISTING + OVERWRITE) for the tables the recurring data
 *      workflows rebuild — CREATE_NEW refuses a table that already exists;
 *   7. three data workflows (weekly forecast, 15-minute signals, hourly
 *      production), each run once so their history exists;
 *   8. the MQTT adapter the replay publisher streams into.
 *
 * Idempotent: existing tables, pipelines and workflows are reused.
 *
 * The source connection comes from `sourceDatabase()` (SAMPLE_POSTGRES_* overrides).
 *
 *   node mock-data/demo2-coffee-capsules/seed/03-seed-data-platform.mjs [--skip-execute] [--skip-workflows] [--rebuild-derived] [--recrawl]
 */
import {
  CURATED_DATABASE,
  DERIVED,
  DIMENSIONS,
  FACTS,
  OPERATOR_LOG_SQL,
  SOURCE_SCHEMA,
  WEATHER_APPEND,
} from '../curated-schema.mjs';
import { coreFetch, readIds, sleep, sourceDatabase, writeIds } from '../ids.mjs';
import { DEMO } from '../reference.mjs';

const skipExecute = process.argv.includes('--skip-execute');
const skipWorkflows = process.argv.includes('--skip-workflows');
const rebuildDerived = process.argv.includes('--rebuild-derived');

const sample = sourceDatabase();
const source = {
  host: sample.host,
  port: sample.port,
  databaseName: sample.database,
  username: sample.username,
  password: sample.password,
  /* The validator wants lowercase SSL modes; sample-postgres runs without TLS. */
  sslMode: 'disable',
};

// 1 ─ Iceberg database.
try {
  await coreFetch('catalogs/iceberg/schemas', {
    method: 'POST',
    body: { name: CURATED_DATABASE, description: 'Mock data — Demo Data 2 (Coffee Capsules), capsule filling & packing lines' },
  });
  console.log(`Created Iceberg database ${CURATED_DATABASE}`);
} catch (error) {
  if (!/409|already|exists/iu.test(error.message)) throw error;
  console.log(`Iceberg database ${CURATED_DATABASE} already exists`);
}

// 2 ─ connection.
const services = await coreFetch('database-services');
const service =
  (services.items ?? services).find?.((item) => item.name === DEMO.serviceName) ??
  (await coreFetch('database-services', {
    method: 'POST',
    body: { name: DEMO.serviceName, databaseName: CURATED_DATABASE, connectorType: 'POSTGRESQL', details: source },
  }));
const verification = await coreFetch(`database-services/${service.id}/test`, { method: 'POST' });
if (verification.status !== 'SUCCEEDED') throw new Error(`Connection did not verify: ${JSON.stringify(verification)}`);
console.log(`Connection "${DEMO.serviceName}" verified (${service.id})`);

// 3 ─ crawl.
const crawlers = await coreFetch('metadata-crawlers');
const crawler =
  (crawlers.items ?? crawlers).find?.((item) => item.name === DEMO.crawlerName) ??
  (await coreFetch('metadata-crawlers', {
    method: 'POST',
    body: {
      databaseServiceId: service.id,
      name: DEMO.crawlerName,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: DEMO.timezone },
      timeoutSeconds: 3_600,
    },
  }));
const relations = await crawlUntilDiscovered(crawler.id);
console.log(`Crawler ${DEMO.crawlerName}: ${relations.size} tables discovered in ${SOURCE_SCHEMA}`);
writeIds({ databaseServiceId: service.id, crawlerId: crawler.id, curatedDatabase: CURATED_DATABASE });

// 4–6 ─ pipelines.
const target = (table, mode = 'CREATE_NEW') =>
  mode === 'CREATE_NEW'
    ? { tableMode: 'CREATE_NEW', databaseName: CURATED_DATABASE, newTableName: table }
    : { tableMode: 'EXISTING', databaseName: CURATED_DATABASE, tableName: table, writeMode: mode };

const mapping = (table, spec, mode) => ({
  table,
  name: mode === 'CREATE_NEW' ? `map_${table}` : `refresh_${table}`,
  description: `Maps ${SOURCE_SCHEMA}.${spec.sourceTable} (source-system column names) to ${table}.`,
  graph: linearGraph([
    pgSource(spec.sourceTable),
    ...(spec.dedupe ? [node('dedupe', 'DROP_DUPLICATES', { name: 'Drop duplicate PLC events', matchFields: [], orderBy: [], keep: 'FIRST' })] : []),
    node('map', 'CHANGE_SCHEMA', {
      name: `Normalize ${spec.sourceTable}`,
      mappings: spec.mappings.map(([sourceField, targetField, targetType]) => ({ sourceField, targetField, targetType })),
    }),
    node('target', 'ICEBERG_TARGET', target(table, mode), 'iceberg:iceberg'),
  ]),
});

const derived = (spec, mode) => ({
  table: spec.table,
  derived: true,
  name: mode === 'CREATE_NEW' ? `derive_${spec.table}` : `refresh_${spec.table}`,
  description: `${spec.label} — reads ${spec.from}.`,
  graph: linearGraph([
    node('source', 'ICEBERG_SOURCE', { catalogDatabaseName: CURATED_DATABASE, catalogTableName: spec.from }, 'iceberg-source:iceberg'),
    node('derive', 'MANUAL_SQL', { name: spec.label, sql: spec.sql.trim() }),
    node('target', 'ICEBERG_TARGET', target(spec.table, mode), 'iceberg:iceberg'),
  ]),
});

const buildSpecs = [
  ...Object.entries(DIMENSIONS).map(([table, spec]) => mapping(table, spec, 'CREATE_NEW')),
  ...Object.entries(FACTS).map(([table, spec]) => mapping(table, spec, 'CREATE_NEW')),
  {
    table: 'fact_signal',
    append: true,
    name: 'append_fact_signal_weather',
    description: 'Appends the weather data (observations + forecast) to fact_signal.',
    graph: linearGraph([
      pgSource(WEATHER_APPEND.sourceTable),
      node('map', 'CHANGE_SCHEMA', {
        name: 'Normalize weather',
        mappings: WEATHER_APPEND.mappings.map(([sourceField, targetField, targetType]) => ({ sourceField, targetField, targetType })),
      }),
      node('target', 'ICEBERG_TARGET', target('fact_signal', 'APPEND'), 'iceberg:iceberg'),
    ]),
  },
  {
    table: 'fact_operator_log',
    name: 'clean_fact_operator_log',
    description: 'Cleans the operators’ shift log (Excel): dd/mm/yyyy dates, "Shift 1" labels, blank cells.',
    graph: linearGraph([
      pgSource('operator_shift_log'),
      node('clean', 'MANUAL_SQL', { name: 'Clean the shift log', sql: OPERATOR_LOG_SQL.trim() }),
      node('target', 'ICEBERG_TARGET', target('fact_operator_log'), 'iceberg:iceberg'),
    ]),
  },
  ...DERIVED.map((spec) => derived(spec, 'CREATE_NEW')),
];

/* Refresh twins used by the data workflows. */
const refreshSpecs = [
  mapping('fact_shipment_weekly', FACTS.fact_shipment_weekly, 'OVERWRITE'),
  mapping('fact_production_hourly', FACTS.fact_production_hourly, 'OVERWRITE'),
  ...DERIVED.map((spec) => derived(spec, 'OVERWRITE')),
];

const pipelinesByName = new Map((await listPipelines()).map((item) => [item.name, item]));
const tables = async () =>
  new Set(((await coreFetch(`catalogs/iceberg/schemas/${CURATED_DATABASE}/tables`).catch(() => [])) ?? []).map((t) => t.name ?? t));
let existing = await tables();
if (rebuildDerived) {
  console.log('--rebuild-derived: derived tables are rebuilt through their refresh pipelines below.');
}

const saved = {};
for (const spec of buildSpecs) {
  const already = spec.append ? existing.has('fact_signal') && readIds().weatherAppended : existing.has(spec.table);
  if (already) {
    console.log(`  ${spec.name} — skipped, ${spec.table} already built`);
    saved[spec.name] = pipelinesByName.get(spec.name)?.id;
    continue;
  }
  const pipeline = await savePipeline(spec);
  saved[spec.name] = pipeline.id;
  if (skipExecute) continue;
  if (spec.append) {
    /* Writing into an EXISTING table only works inside a data workflow run: a
       direct execution has no caller identity in the worker, and its compile-time
       target-schema check is denied (DEFAULT_DENY). */
    await runViaWorkflow('Load weather into fact_signal (one-off)', [pipeline]);
    writeIds({ weatherAppended: true });
    existing = await tables();
    continue;
  }
  if (spec.derived) {
    /* An ICEBERG_SOURCE is also denied in a direct execution (same missing worker
       identity), so derived tables are built through one reusable bootstrap workflow. */
    await runViaWorkflow('Build derived tables (bootstrap)', [pipeline]);
  } else {
    await runPipeline(pipeline, spec);
  }
  existing = await tables();
}

const toRebuild = [];
for (const spec of refreshSpecs) {
  if (!existing.has(spec.table)) {
    console.log(`  ${spec.name} — skipped, ${spec.table} does not exist yet`);
    continue;
  }
  const pipeline = await savePipeline(spec);
  saved[spec.name] = pipeline.id;
  if (rebuildDerived && spec.derived) toRebuild.push(pipeline);
}
if (toRebuild.length > 0 && !skipExecute) {
  await runViaWorkflow('Recompute derived tables (manual)', toRebuild);
}
writeIds({ pipelines: saved });

// 7 ─ data workflows.
if (!skipWorkflows && !skipExecute) {
  const workflows = [
    {
      key: 'wf_weekly_forecast',
      name: 'Weekly demand forecast (Monday 03:00)',
      trigger: { type: 'CALENDAR', timeOfDay: '03:00', weekdays: ['MON'], timezone: DEMO.timezone },
      chain: ['refresh_fact_shipment_weekly', 'refresh_fact_demand_forecast'],
      paused: false,
    },
    {
      key: 'wf_signals_15min',
      name: 'Equipment & humidity signals (15 minutes)',
      trigger: { type: 'INTERVAL', everySeconds: 900, anchorAt: '2026-01-01T00:00:00.000Z' },
      chain: ['refresh_fact_asset_health', 'refresh_fact_room_risk', 'refresh_dm_asset_health', 'refresh_dm_room_env'],
      paused: true,
    },
    {
      key: 'wf_production_hourly',
      name: 'Output & OEE (hourly)',
      trigger: { type: 'INTERVAL', everySeconds: 3_600, anchorAt: '2026-01-01T00:05:00.000Z' },
      chain: ['refresh_fact_production_hourly', 'refresh_fact_oee_shift', 'refresh_dm_workcenter_status'],
      paused: true,
    },
  ];
  const listed = await coreFetch('data-workflows');
  const byName = new Map((listed.items ?? listed).map?.((item) => [item.name ?? item.draft?.name, item]) ?? []);
  const ids = {};
  for (const spec of workflows) {
    const versions = await Promise.all(
      spec.chain.map(async (name) => {
        const detail = await coreFetch(`pipelines/${saved[name]}`);
        return { id: saved[name], version: detail.version ?? detail.latestVersion ?? 1 };
      }),
    );
    const graph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', config: spec.trigger, position: { x: 0, y: 0 } },
        ...versions.map((item, index) => ({ id: `p${index + 1}`, type: 'PIPELINE', pipelineId: item.id, versionNumber: item.version, position: { x: 280 * (index + 1), y: 0 } })),
      ],
      edges: versions.map((_, index) => ({
        id: `e${index + 1}`,
        sourceNodeId: index === 0 ? 'trigger' : `p${index}`,
        sourcePortId: 'out',
        targetNodeId: `p${index + 1}`,
        targetPortId: 'in',
      })),
    };
    let workflow = byName.get(spec.name);
    if (workflow === undefined) {
      workflow = await coreFetch('data-workflows', { method: 'POST', body: { draft: { name: spec.name, graph }, paused: true } });
      /* Publishing returns the VERSION, not the workflow — keep the workflow object. */
      await coreFetch(`data-workflows/${workflow.id}/versions`, { method: 'POST', body: { expectedRevision: workflow.revision } });
      console.log(`Workflow "${spec.name}" created and published`);
    } else {
      console.log(`Workflow "${spec.name}" already exists`);
    }
    ids[spec.key] = workflow.id;
    const runs = await coreFetch(`data-workflows/${workflow.id}/runs?limit=5`).catch(() => []);
    if ((runs.items ?? runs).length === 0) {
      const run = await coreFetch(`data-workflows/${workflow.id}/runs`, { method: 'POST', body: { parameters: {} } });
      const status = await waitFor(() => coreFetch(`data-workflows/${workflow.id}/runs/${run.id ?? run.runId}`), 1_200);
      console.log(`  first run: ${status}`);
    }
    const current = await coreFetch(`data-workflows/${workflow.id}`);
    if ((current.paused ?? true) !== spec.paused) {
      await coreFetch(`data-workflows/${workflow.id}/state`, { method: 'PATCH', body: { expectedRevision: current.revision, paused: spec.paused } });
    }
    console.log(`  ${spec.paused ? 'paused (unpause for the ≥3-day pre-run on dev)' : 'enabled'}`);
  }
  writeIds({ dataWorkflows: ids });
}

// 8 ─ MQTT adapter.
const adapters = await coreFetch('streaming/mqtt-adapters');
const adapter = (adapters.items ?? adapters).find?.((item) => item.name === DEMO.mqttAdapterName);
if (adapter === undefined) {
  const registration = await coreFetch('streaming/mqtt-adapters', {
    method: 'POST',
    body: { tenantStorageKey: DEMO.mqttTenantKey, tenantDisplayName: 'Demo Data 2 (Coffee Capsules)', name: DEMO.mqttAdapterName, qos: 1, placementKind: 'SHARED' },
  });
  writeIds({ streamAdapterId: registration.adapter.id, mqttUsername: registration.credential.username });
  console.log(`\nMQTT adapter ${DEMO.mqttAdapterName} created. Credential (shown once): ${registration.credential.username} / ${registration.credential.password}`);
  console.log(`Bronze prefix: ${registration.adapter.bronzeObjectPrefix}`);
} else {
  writeIds({ streamAdapterId: adapter.id });
  console.log(`\nMQTT adapter ${DEMO.mqttAdapterName} already exists (${adapter.status}).`);
}
console.log('\nData platform ready.');

/* ── helpers ─────────────────────────────────────────────────────────── */

function node(id, definitionType, config, resourceId) {
  return { id, definitionType, ...(resourceId ? { resourceId } : {}), position: { x: 0, y: 0 }, config };
}

function pgSource(table) {
  const binding = relations.get(table);
  if (binding === undefined) throw new Error(`The crawl did not return ${SOURCE_SCHEMA}.${table}.`);
  return node('source', 'POSTGRES_SOURCE', {
    sourceMode: 'DATABASE_SERVICE',
    schemaName: SOURCE_SCHEMA,
    tableName: table,
    catalogNamespaceId: binding.namespaceId,
    catalogRelationId: binding.relationId,
  }, `connection:${service.id}`);
}

function linearGraph(nodes) {
  return {
    nodes: nodes.map((item, index) => ({ ...item, position: { x: index * 320, y: 0 } })),
    edges: nodes.slice(1).map((item, index) => ({
      sourceNodeId: nodes[index].id,
      sourcePortId: 'output',
      targetNodeId: item.id,
      targetPortId: 'input',
    })),
  };
}

async function savePipeline(spec) {
  const validation = await coreFetch('pipelines/validate', { method: 'POST', body: { graph: spec.graph } });
  if (validation.errors.length > 0) {
    throw new Error(`Pipeline ${spec.name} is invalid:\n  ${validation.errors.map((i) => `${i.nodeId ?? '-'} ${i.code}: ${i.message}`).join('\n  ')}`);
  }
  let pipeline = pipelinesByName.get(spec.name);
  /* A pipeline saved by an interrupted run can hold relation ids from an older crawl;
     its table was never built, so replace it rather than reuse it. */
  if (pipeline !== undefined && !spec.name.startsWith('refresh_') && !existing.has(spec.table)) {
    await coreFetch(`pipelines/${pipeline.id}`, { method: 'DELETE' });
    pipelinesByName.delete(spec.name);
    pipeline = undefined;
  }
  if (pipeline === undefined) {
    pipeline = await coreFetch('pipelines', {
      method: 'POST',
      body: { name: spec.name, databaseName: CURATED_DATABASE, description: spec.description, graph: spec.graph },
    });
    pipelinesByName.set(spec.name, pipeline);
  }
  console.log(`  ${spec.name} → ${spec.table}`);
  return pipeline;
}

async function runPipeline(pipeline, spec) {
  const version = pipeline.version ?? pipeline.latestVersion ?? 1;
  await coreFetch(`pipelines/${pipeline.id}/versions/${version}/compile`, { method: 'POST' });
  const execution = await coreFetch(`pipelines/${pipeline.id}/versions/${version}/executions`, { method: 'POST' });
  const started = Date.now();
  const status = await waitFor(() => coreFetch(`executions/${execution.executionId ?? execution.id}`), 900);
  if (status !== 'SUCCEEDED') {
    const detail = await coreFetch(`executions/${execution.executionId ?? execution.id}`).catch(() => ({}));
    throw new Error(`Pipeline ${spec.name} finished ${status}: ${String(detail.errorSummary ?? detail.message ?? '').slice(0, 1_500)}`);
  }
  console.log(`    built ${spec.table} in ${Math.round((Date.now() - started) / 1000)} s`);
}

/** Creates (or reuses) a paused, published data workflow chaining these pipelines, and runs it once. */
async function runViaWorkflow(name, pipelines) {
  const graph = {
    nodes: [{ id: 'trigger', type: 'TRIGGER', position: { x: 0, y: 0 } },
      ...pipelines.map((p, i) => ({ id: `p${i + 1}`, type: 'PIPELINE', pipelineId: p.id, versionNumber: p.version ?? 1, position: { x: 280 * (i + 1), y: 0 } }))],
    edges: pipelines.map((_, i) => ({ id: `e${i + 1}`, sourceNodeId: i === 0 ? 'trigger' : `p${i}`, sourcePortId: 'out', targetNodeId: `p${i + 1}`, targetPortId: 'in' })),
  };
  const listed = await coreFetch('data-workflows');
  let workflow = (listed.items ?? listed).find?.((item) => item.name === name);
  if (workflow === undefined) {
    workflow = await coreFetch('data-workflows', { method: 'POST', body: { draft: { name, graph }, paused: true } });
    await coreFetch(`data-workflows/${workflow.id}/versions`, { method: 'POST', body: { expectedRevision: workflow.revision } });
  } else if (JSON.stringify(workflow.draft?.nodes?.map((n) => n.pipelineId)) !== JSON.stringify(graph.nodes.map((n) => n.pipelineId))) {
    /* Reuse one bootstrap workflow: point it at the next pipeline(s) and publish. */
    const updated = await coreFetch(`data-workflows/${workflow.id}`, { method: 'PATCH', body: { expectedRevision: workflow.revision, draft: { name, graph } } });
    await coreFetch(`data-workflows/${workflow.id}/versions`, { method: 'POST', body: { expectedRevision: updated.revision } });
  }
  const run = await coreFetch(`data-workflows/${workflow.id}/runs`, { method: 'POST', body: { parameters: {} } });
  const status = await waitFor(() => coreFetch(`data-workflows/${workflow.id}/runs/${run.runId ?? run.id}`), 900);
  if (status !== 'SUCCEEDED') throw new Error(`Data workflow "${name}" finished ${status}.`);
  console.log(`    ran "${name}" (${pipelines.map((p) => p.name).join(' → ')})`);
}

async function waitFor(read, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(2_000);
    const item = await read().catch(() => undefined);
    const status = String(item?.status ?? '').toUpperCase();
    if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'PARTIALLY_FAILED'].includes(status)) return status;
  }
  return 'TIMED_OUT';
}

async function crawlUntilDiscovered(crawlerId) {
  const before = await coreFetch(`metadata-crawlers/${crawlerId}/runs`);
  const done = (before.items ?? before).some?.((run) => run.status === 'SUCCEEDED');
  if (!done || process.argv.includes('--recrawl')) {
    await coreFetch(`metadata-crawlers/${crawlerId}/runs`, { method: 'POST' });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await sleep(2_000);
      const runs = await coreFetch(`metadata-crawlers/${crawlerId}/runs`);
      const latest = (runs.items ?? runs)[0];
      if (latest?.status === 'SUCCEEDED') break;
      if (latest?.status === 'FAILED') throw new Error(`The metadata crawl failed: ${latest.message}`);
      if (attempt === 15 && latest?.status === 'QUEUED') console.log('  crawl still queued — is the Core worker and broker up?');
    }
  }
  const namespaces = await coreFetch(`metadata-crawlers/${crawlerId}/metadata/namespaces`);
  const namespace = (namespaces.items ?? namespaces).find?.((item) => item.name.toLowerCase() === SOURCE_SCHEMA);
  if (namespace === undefined) throw new Error(`The crawl did not discover schema ${SOURCE_SCHEMA}.`);
  const relationsMap = new Map();
  let cursor;
  do {
    const page = await coreFetch(
      `metadata-crawlers/${crawlerId}/metadata/namespaces/${namespace.id}/relations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    for (const relation of page.items ?? page) relationsMap.set(relation.name, { namespaceId: namespace.id, relationId: relation.id });
    cursor = page.nextCursor ?? page.next_cursor;
  } while (cursor);
  return relationsMap;
}

/** Pipelines come back as a plain array, 20 per page by default. */
async function listPipelines() {
  const all = [];
  for (let page = 1; page < 50; page += 1) {
    const batch = await coreFetch(`pipelines?page=${page}&pageSize=100`);
    const items = Array.isArray(batch) ? batch : (batch.items ?? []);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

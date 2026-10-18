/**
 * Phase 5 — the data platform behind Demo Data 1 (Home Appliance), and Act 4's story.
 *
 * Crawl → map → process, in the order the platform itself imposes:
 *   1. an Iceberg database to write into
 *   2. a Postgres connection to the plant MES, with a real connection test
 *   3. a metadata crawler, run to completion — its discovered namespace and
 *      relation ids are *required* by every POSTGRES_SOURCE node, so this is a
 *      hard prerequisite and not just a nice screen to show
 *   4. one pipeline per curated table, validated before it is saved
 *   5. executions in dependency order (dimensions, then facts, then the derived
 *      OEE and plant-model lookup tables)
 *   6. the MQTT adapter the device simulator publishes into
 *
 * Re-running is safe up to step 4. The Iceberg targets are CREATE_NEW, so
 * re-executing needs the curated tables dropped first.
 *
 * The source is the `sample-postgres` compose service (schema
 * `demo1_home_appliance`), as Core reaches it inside the compose network; see
 * `sourceDatabase()` in ../../lib/http.mjs for the SAMPLE_POSTGRES_* overrides.
 *
 *   node mock-data/demo1-home-appliance/seed/05-seed-data-platform.mjs [--skip-execute] [--rebuild]
 */
import {
  CURATED_DATABASE,
  DIMENSIONS,
  DM_EQUIPMENT_OEE_SQL,
  DM_WORKCENTER_STATUS_SQL,
  FACTS,
  OEE_SHIFT_SQL,
  SOURCE_SCHEMA,
} from '../curated-schema.mjs';
import { DEMO, coreFetch, sleep, sourceDatabase, writeIds } from '../ids.mjs';

const skipExecute = process.argv.includes('--skip-execute');
/** Rebuilds a curated table even when it already exists; drop it first. */
const rebuild = process.argv.includes('--rebuild');
const sourceDb = sourceDatabase();
const source = {
  host: sourceDb.host,
  port: sourceDb.port,
  databaseName: sourceDb.database,
  username: sourceDb.username,
  password: sourceDb.password,
  sslMode: 'disable',
};

// 1 ─ the Iceberg database every target writes into.
try {
  await coreFetch('catalogs/iceberg/schemas', {
    method: 'POST',
    body: {
      name: CURATED_DATABASE,
      description: 'Mock data — Demo Data 1 – Home Appliance Plant (Chest Freezers)',
    },
  });
  console.log(`Created Iceberg database ${CURATED_DATABASE}`);
} catch (error) {
  if (!/409|already|exists/iu.test(error.message)) throw error;
  console.log(`Iceberg database ${CURATED_DATABASE} already exists`);
}

// 2 ─ the connection to the plant MES, proven rather than assumed.
const services = await coreFetch('database-services');
const serviceName = 'Demo Data 1 MES – Home Appliance';
const service =
  (services.items ?? []).find((item) => item.name === serviceName) ??
  (await coreFetch('database-services', {
    method: 'POST',
    body: {
      name: serviceName,
      databaseName: CURATED_DATABASE,
      connectorType: 'POSTGRESQL',
      details: source,
    },
  }));
const verification = await coreFetch(`database-services/${service.id}/test`, { method: 'POST' });
if (verification.status !== 'SUCCEEDED') {
  throw new Error(`The MES connection did not verify: ${JSON.stringify(verification)}`);
}
console.log(`Connection ${serviceName} verified (${service.id})`);

// 3 ─ the crawl. Its ids are a hard prerequisite for every source node below.
const crawlers = await coreFetch('metadata-crawlers');
const crawlerName = 'demo1-mes-daily';
const crawler =
  (crawlers.items ?? crawlers).find?.((item) => item.name === crawlerName) ??
  (await coreFetch('metadata-crawlers', {
    method: 'POST',
    body: {
      databaseServiceId: service.id,
      name: crawlerName,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: DEMO.timezone },
      timeoutSeconds: 3_600,
    },
  }));
console.log(`Crawler ${crawlerName} (${crawler.id})`);

const relations = await crawlUntilDiscovered(crawler.id);
console.log(`Discovered ${relations.size} tables in ${SOURCE_SCHEMA}`);

writeIds({
  databaseServiceId: service.id,
  crawlerId: crawler.id,
  curatedDatabase: CURATED_DATABASE,
});

// 4 ─ one pipeline per curated table, validated before it is saved.
const specs = [
  ...Object.entries(DIMENSIONS).map(([table, mappings]) => ({
    table,
    name: `map_${table}`,
    description: `Pins the column types of ${table}.`,
    graph: mappingGraph(table, table, mappings),
  })),
  ...Object.entries(FACTS).map(([table, spec]) => ({
    table,
    name: `map_${table}`,
    description: `Maps ${spec.sourceTable} (raw MES columns) to ${table}.`,
    graph: mappingGraph(table, spec.sourceTable, spec.mappings),
  })),
  {
    table: 'fact_oee_shift',
    derived: true,
    dependsOn: 'fact_production_hourly',
    name: 'derive_fact_oee_shift',
    description: 'Computes shift OEE from fact_production_hourly — the single OEE definition.',
    graph: derivedGraph(
      'fact_oee_shift',
      'fact_production_hourly',
      OEE_SHIFT_SQL,
      'Compute shift OEE',
    ),
  },
  {
    table: 'dm_workcenter_status',
    derived: true,
    dependsOn: 'fact_oee_shift',
    name: 'derive_dm_workcenter_status',
    description: 'Station status lookup for the Plant Model live property.',
    graph: derivedGraph(
      'dm_workcenter_status',
      'fact_oee_shift',
      DM_WORKCENTER_STATUS_SQL,
      'Status lookup',
    ),
  },
  {
    table: 'dm_equipment_oee',
    derived: true,
    dependsOn: 'fact_oee_shift',
    name: 'derive_dm_equipment_oee',
    description: 'Latest OEE per machine for the Plant Model live property.',
    graph: derivedGraph('dm_equipment_oee', 'fact_oee_shift', DM_EQUIPMENT_OEE_SQL, 'Equipment OEE'),
  },
];

const existing = await coreFetch('pipelines');
const pipelinesByName = new Map(
  (existing.items ?? existing).map?.((item) => [item.name, item]) ?? [],
);

/*
 * Validate, save and run one pipeline before touching the next.
 *
 * An ICEBERG_SOURCE node will not even validate until its table exists, so the
 * derived pipelines cannot be created until the mapping pipelines that build
 * their inputs have actually run. Creating all seventeen up front fails on the
 * fifteenth; walking the dependency order one at a time is the only thing that
 * works — and it is also how a person would do it in the UI.
 */
/*
 * Which curated tables are already built. An ICEBERG_TARGET in CREATE_NEW mode
 * refuses to validate against a table that exists, so without this a second run
 * fails on the first pipeline instead of picking up where it left off.
 */
const existingTables = new Set(
  (
    (await coreFetch(`catalogs/iceberg/schemas/${CURATED_DATABASE}/tables`).catch(() => [])) ?? []
  ).map((table) => table.name ?? table),
);
if (existingTables.size > 0) {
  console.log(`Already built: ${[...existingTables].sort().join(', ')}`);
}

const built = [];
for (const spec of specs) {
  if (existingTables.has(spec.table) && !rebuild) {
    console.log(`  ${spec.name} — skipped, ${spec.table} already exists`);
    continue;
  }
  const validation = await coreFetch('pipelines/validate', {
    method: 'POST',
    body: { graph: spec.graph },
  });
  if (validation.errors.length > 0) {
    if (skipExecute && spec.derived) {
      console.log(`  ${spec.name} — skipped: needs ${spec.dependsOn} to exist first`);
      continue;
    }
    throw new Error(
      `Pipeline ${spec.name} is invalid:\n  ${validation.errors
        .map((issue) => `${issue.nodeId ?? '-'} ${issue.code}: ${issue.message}`)
        .join('\n  ')}`,
    );
  }
  const warnings = validation.warnings.map((issue) => issue.code);

  const pipeline =
    pipelinesByName.get(spec.name) ??
    (await coreFetch('pipelines', {
      method: 'POST',
      body: {
        name: spec.name,
        databaseName: CURATED_DATABASE,
        description: spec.description,
        graph: spec.graph,
      },
    }));
  built.push({ ...spec, pipeline });
  console.log(
    `  ${spec.name} → ${spec.table}${warnings.length === 0 ? '' : ` (warnings: ${warnings.join(', ')})`}`,
  );

  if (skipExecute) continue;
  const version = pipeline.version ?? pipeline.latestVersion ?? 1;
  /* A version carries no Spark artifact until it is compiled; running one first returns 404. */
  await coreFetch(`pipelines/${pipeline.id}/versions/${version}/compile`, { method: 'POST' });
  const execution = await coreFetch(`pipelines/${pipeline.id}/versions/${version}/executions`, {
    method: 'POST',
  });
  const status = await waitForExecution(execution.executionId ?? execution.id);
  if (status !== 'SUCCEEDED') {
    throw new Error(`Pipeline ${spec.name} finished ${status}; ${spec.table} was not built.`);
  }
  console.log(`    built ${spec.table}`);
}

if (skipExecute) {
  console.log('\n--skip-execute: pipelines saved but not run.');
}

// 6 ─ the MQTT adapter the device simulator publishes into.
const adapters = await coreFetch('streaming/mqtt-adapters');
const adapterName = 'demo1-home-appliance-iot';
const adapter = (adapters.items ?? adapters).find?.((item) => item.name === adapterName);
if (adapter === undefined) {
  const registration = await coreFetch('streaming/mqtt-adapters', {
    method: 'POST',
    body: {
      /* Core requires /^tnt_[a-z0-9]{12,48}$/ — the prefix is not optional. */
      tenantStorageKey: 'tnt_demo1homeappliance',
      tenantDisplayName: DEMO.collectionName,
      name: adapterName,
      qos: 1,
      placementKind: 'SHARED',
    },
  });
  writeIds({ streamAdapterId: registration.adapter.id });
  console.log(
    `\nMQTT adapter ${adapterName} created. Credential (shown once): ` +
      `${registration.credential.username} / ${registration.credential.password}`,
  );
  console.log(`Bronze prefix: ${registration.adapter.bronzeObjectPrefix}`);
} else {
  writeIds({ streamAdapterId: adapter.id });
  console.log(`\nMQTT adapter ${adapterName} already exists (${adapter.status}).`);
}

console.log('\nData platform ready.');

/**
 * Runs the crawler and waits for it to discover the MES tables.
 *
 * The run is dispatched through the message bus, so a queued run that never
 * moves means the worker or the broker is not up — worth saying plainly rather
 * than letting the caller watch a spinner.
 */
async function crawlUntilDiscovered(crawlerId) {
  await coreFetch(`metadata-crawlers/${crawlerId}/runs`, { method: 'POST' });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(2_000);
    const runs = await coreFetch(`metadata-crawlers/${crawlerId}/runs`);
    const latest = (runs.items ?? runs)[0];
    if (latest?.status === 'SUCCEEDED') break;
    if (latest?.status === 'FAILED')
      throw new Error(`The metadata crawl failed: ${latest.message}`);
    if (attempt === 14 && latest?.status === 'QUEUED') {
      console.log('  still queued — is the Core worker running, and the message broker up?');
    }
  }

  const namespaces = await coreFetch(`metadata-crawlers/${crawlerId}/metadata/namespaces`);
  const namespace = (namespaces.items ?? namespaces).find?.(
    (item) => item.name.toLowerCase() === SOURCE_SCHEMA,
  );
  if (namespace === undefined) {
    throw new Error(
      `The crawl did not discover schema ${SOURCE_SCHEMA}. Every POSTGRES_SOURCE node needs its ` +
        'namespace and relation ids, so the pipelines cannot be built until it does.',
    );
  }
  const page = await coreFetch(
    `metadata-crawlers/${crawlerId}/metadata/namespaces/${namespace.id}/relations`,
  );
  return new Map(
    (page.items ?? page).map((relation) => [
      relation.name,
      { namespaceId: namespace.id, relationId: relation.id },
    ]),
  );
}

async function waitForExecution(executionId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    await sleep(2_000);
    const execution = await coreFetch(`executions/${executionId}`);
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(execution.status)) return execution.status;
  }
  return 'TIMED_OUT';
}

/** SOURCE → CHANGE_SCHEMA → TARGET: the shape Act 4 opens on camera. */
function mappingGraph(table, sourceTable, mappings) {
  const binding = relations.get(sourceTable);
  if (binding === undefined) {
    throw new Error(`The crawl did not return ${SOURCE_SCHEMA}.${sourceTable}.`);
  }
  return {
    nodes: [
      {
        id: 'source',
        definitionType: 'POSTGRES_SOURCE',
        resourceId: `connection:${service.id}`,
        position: { x: 0, y: 0 },
        config: {
          sourceMode: 'DATABASE_SERVICE',
          schemaName: SOURCE_SCHEMA,
          tableName: sourceTable,
          catalogNamespaceId: binding.namespaceId,
          catalogRelationId: binding.relationId,
        },
      },
      {
        id: 'map',
        definitionType: 'CHANGE_SCHEMA',
        position: { x: 320, y: 0 },
        config: {
          name: `Normalize ${sourceTable}`,
          mappings: mappings.map(([sourceField, targetField, targetType]) => ({
            sourceField,
            targetField,
            targetType,
          })),
        },
      },
      {
        id: 'target',
        definitionType: 'ICEBERG_TARGET',
        resourceId: 'iceberg:iceberg',
        position: { x: 640, y: 0 },
        config: { tableMode: 'CREATE_NEW', databaseName: CURATED_DATABASE, newTableName: table },
      },
    ],
    edges: [
      {
        sourceNodeId: 'source',
        sourcePortId: 'output',
        targetNodeId: 'map',
        targetPortId: 'input',
      },
      {
        sourceNodeId: 'map',
        sourcePortId: 'output',
        targetNodeId: 'target',
        targetPortId: 'input',
      },
    ],
  };
}

/** ICEBERG_SOURCE → MANUAL_SQL → TARGET, for tables derived from curated ones. */
function derivedGraph(table, sourceTable, sql, label) {
  return {
    nodes: [
      {
        id: 'source',
        definitionType: 'ICEBERG_SOURCE',
        resourceId: 'iceberg-source:iceberg',
        position: { x: 0, y: 0 },
        config: { catalogDatabaseName: CURATED_DATABASE, catalogTableName: sourceTable },
      },
      {
        id: 'derive',
        definitionType: 'MANUAL_SQL',
        position: { x: 320, y: 0 },
        config: { name: label, sql: sql.trim() },
      },
      {
        id: 'target',
        definitionType: 'ICEBERG_TARGET',
        resourceId: 'iceberg:iceberg',
        position: { x: 640, y: 0 },
        config: { tableMode: 'CREATE_NEW', databaseName: CURATED_DATABASE, newTableName: table },
      },
    ],
    edges: [
      {
        sourceNodeId: 'source',
        sourcePortId: 'output',
        targetNodeId: 'derive',
        targetPortId: 'input',
      },
      {
        sourceNodeId: 'derive',
        sourcePortId: 'output',
        targetNodeId: 'target',
        targetPortId: 'input',
      },
    ],
  };
}

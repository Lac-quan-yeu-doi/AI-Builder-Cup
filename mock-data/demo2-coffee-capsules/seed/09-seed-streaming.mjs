/**
 * Demo Data 2, phase 9 — live signals: MQTT → bronze → `fact_signal`.
 *
 * Prerequisites: the adapter from 03 (tenant `tnt_demo2capsules01`), EMQX +
 * Redpanda + the Spark bronze stream running, and at least one message
 * published (mock-data/demo2-coffee-capsules/replay_publisher.py). The bronze
 * table only exists after the first ingested message, and an ICEBERG_SOURCE will
 * not validate before it does — so this script checks first and explains.
 *
 * Two pipelines, because an APPEND target needs a statically known schema and
 * unpacking JSON is only possible in MANUAL_SQL (whose output is inferred at
 * runtime):
 *   stage_signal_mqtt  : bronze mqtt_events → MANUAL_SQL (last 20 minutes) → OVERWRITE stg_signal_mqtt
 *   append_signal_mqtt : stg_signal_mqtt → CHANGE_SCHEMA → APPEND fact_signal
 * Put both at the front of the "Equipment & humidity signals (15 minutes)" data
 * workflow. The 20-minute window overlaps the 15-minute cadence slightly; the
 * health and risk models average to 30-minute buckets, so an overlap is harmless.
 *
 *   node mock-data/demo2-coffee-capsules/seed/09-seed-streaming.mjs [--bronze-schema tnt_demo2capsules01_bronze]
 */
import { CURATED_DATABASE, FACTS } from '../curated-schema.mjs';
import { DATA_END_DATE, argument, coreFetch, readIds, sleep, writeIds } from '../ids.mjs';
import { DEMO } from '../reference.mjs';

const bronzeSchema = argument('bronze-schema', `${DEMO.mqttTenantKey}_bronze`);
const schemas = await coreFetch('catalogs/iceberg/schemas');
const schemaNames = (schemas.items ?? schemas).map((item) => item.name ?? item);
const tables = schemaNames.includes(bronzeSchema)
  ? ((await coreFetch(`catalogs/iceberg/schemas/${bronzeSchema}/tables`)) ?? []).map((t) => t.name ?? t)
  : [];
if (!tables.includes('mqtt_events')) {
  console.log(
    `No ${bronzeSchema}.mqtt_events yet. Publish first:\n` +
      `  node mock-data/demo2-coffee-capsules/generate.mjs --end-date ${DATA_END_DATE} --out mock-data/demo2-coffee-capsules/out\n` +
      '  python3 mock-data/demo2-coffee-capsules/replay_publisher.py mock-data/demo2-coffee-capsules/out/sensor_live_48h.csv \\\n' +
      `    --tenant ${DEMO.mqttTenantKey} --adapter-key <adapter public key> --password <credential from 03> --speed 60\n` +
      'then re-run this script. (Needs EMQX, Redpanda and the Spark MQTT bronze stream.)',
  );
  process.exit(0);
}

const STAGE_SQL = `
WITH e AS (SELECT * FROM input WHERE received_at > current_timestamp() - INTERVAL 20 MINUTES)
SELECT coalesce(event_time, received_at) AS ts,
       get_json_object(payload_json, '$.tag') AS tag,
       cast(get_json_object(payload_json, '$.value') AS double) AS value,
       'GOOD' AS quality,
       'MQTT' AS source
FROM e WHERE get_json_object(payload_json, '$.tag') IS NOT NULL`;

const node = (id, definitionType, config, resourceId) => ({ id, definitionType, ...(resourceId ? { resourceId } : {}), position: { x: 0, y: 0 }, config });
const linear = (nodes) => ({
  nodes: nodes.map((item, index) => ({ ...item, position: { x: index * 320, y: 0 } })),
  edges: nodes.slice(1).map((item, index) => ({ sourceNodeId: nodes[index].id, sourcePortId: 'output', targetNodeId: item.id, targetPortId: 'input' })),
});

const curated = ((await coreFetch(`catalogs/iceberg/schemas/${CURATED_DATABASE}/tables`)) ?? []).map((t) => t.name ?? t);
const specs = [
  {
    name: 'stage_signal_mqtt',
    description: 'Unpacks the last 20 minutes of MQTT messages (JSON payload) into long-format signals.',
    graph: linear([
      node('source', 'ICEBERG_SOURCE', { catalogDatabaseName: bronzeSchema, catalogTableName: 'mqtt_events' }, 'iceberg-source:iceberg'),
      node('unpack', 'MANUAL_SQL', { name: 'Unpack the MQTT payload', sql: STAGE_SQL.trim() }),
      node('target', 'ICEBERG_TARGET', curated.includes('stg_signal_mqtt')
        ? { tableMode: 'EXISTING', databaseName: CURATED_DATABASE, tableName: 'stg_signal_mqtt', writeMode: 'OVERWRITE' }
        : { tableMode: 'CREATE_NEW', databaseName: CURATED_DATABASE, newTableName: 'stg_signal_mqtt' }, 'iceberg:iceberg'),
    ]),
  },
  {
    name: 'append_signal_mqtt',
    description: 'Appends the MQTT signals to fact_signal alongside the historian and weather data.',
    graph: linear([
      node('source', 'ICEBERG_SOURCE', { catalogDatabaseName: CURATED_DATABASE, catalogTableName: 'stg_signal_mqtt' }, 'iceberg-source:iceberg'),
      node('map', 'CHANGE_SCHEMA', {
        name: 'Normalize MQTT signals',
        mappings: FACTS.fact_signal.mappings.map(([, field, type]) => ({ sourceField: field, targetField: field, targetType: type })),
      }),
      node('target', 'ICEBERG_TARGET', { tableMode: 'EXISTING', databaseName: CURATED_DATABASE, tableName: 'fact_signal', writeMode: 'APPEND' }, 'iceberg:iceberg'),
    ]),
  },
];

const existing = new Map((await listPipelines()).map((item) => [item.name, item]));
const saved = {};
for (const spec of specs) {
  const validation = await coreFetch('pipelines/validate', { method: 'POST', body: { graph: spec.graph } });
  if (validation.errors.length > 0) throw new Error(`${spec.name}: ${validation.errors.map((e) => `${e.code} ${e.message}`).join('; ')}`);
  const pipeline = existing.get(spec.name) ?? (await coreFetch('pipelines', { method: 'POST', body: { name: spec.name, databaseName: CURATED_DATABASE, description: spec.description, graph: spec.graph } }));
  const version = pipeline.version ?? pipeline.latestVersion ?? 1;
  await coreFetch(`pipelines/${pipeline.id}/versions/${version}/compile`, { method: 'POST' });
  const execution = await coreFetch(`pipelines/${pipeline.id}/versions/${version}/executions`, { method: 'POST' });
  let status = 'RUNNING';
  for (let attempt = 0; attempt < 300 && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status); attempt += 1) {
    await sleep(2_000);
    status = (await coreFetch(`executions/${execution.executionId ?? execution.id}`)).status;
  }
  console.log(`${spec.name}: ${status}`);
  if (status !== 'SUCCEEDED') process.exit(1);
  saved[spec.name] = pipeline.id;
}
writeIds({ pipelines: { ...(readIds().pipelines ?? {}), ...saved } });
console.log('Add stage_signal_mqtt → append_signal_mqtt at the front of the 15-minute data workflow (UI → Data workflows).');

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

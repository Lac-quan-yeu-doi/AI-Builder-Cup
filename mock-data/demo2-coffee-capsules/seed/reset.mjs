/**
 * Tears Demo Data 2 (coffee capsules) down so the seeds can rebuild it from scratch.
 *
 * Reverse dependency order: automation workflows → plant-site dashboard
 * associations → dashboards → charts → pipelines → Iceberg tables. What Core has
 * no delete endpoint for is left in place and reported: the plant site (01 is
 * idempotent and reuses it), the database service, the crawler, the data
 * workflows and the MQTT adapter (03 reuses them by name).
 * Agent manifests are never touched here — never DELETE one (the org override
 * is the only copy on this stack); `06-agents.mjs --revert` PUTs the repo YAML back.
 *
 * Iceberg tables are dropped through the local Trino container
 * (`--drop-tables`, container from TRINO_CONTAINER, default the compose
 * project's `minder-sys-trino-coordinator-1`); on a deployed env the script
 * prints the DROP statements for someone with catalog admin rights instead.
 *
 *   node mock-data/demo2-coffee-capsules/seed/reset.mjs [--drop-tables] [--yes]
 */
import { execFileSync } from 'node:child_process';

import { BUILD_ORDER, CURATED_DATABASE } from '../curated-schema.mjs';
import { coreFetch, readIds, writeIds } from '../ids.mjs';

if (!process.argv.includes('--yes')) {
  console.log('Dry run — pass --yes to delete. Would remove: automation workflows, dashboards, charts, pipelines' +
    `${process.argv.includes('--drop-tables') ? `, and every table in iceberg.${CURATED_DATABASE}` : ''}.`);
  process.exit(0);
}

const ids = readIds();
const quietly = async (label, run) => {
  try {
    await run();
    console.log(`  removed ${label}`);
  } catch (error) {
    console.log(`  ! ${label}: ${error.message.slice(0, 160)}`);
  }
};

for (const id of Object.values(ids.automationWorkflows ?? {})) {
  await quietly(`automation workflow ${id}`, () => coreFetch(`automation-workflows/${id}`, { method: 'DELETE' }));
}
for (const entry of Object.values(ids.dashboards ?? {})) {
  if (ids.plantSiteId) {
    await quietly(`association ${entry.id}`, () => coreFetch(`plant-sites/${ids.plantSiteId}/dashboards/${entry.id}`, { method: 'DELETE' }));
  }
  await quietly(`dashboard ${entry.id}`, () => coreFetch(`dashboards/${entry.id}`, { method: 'DELETE' }));
}
for (const id of Object.values(ids.charts ?? {})) {
  await quietly(`chart ${id}`, () => coreFetch(`chart-authoring/charts/${id}`, { method: 'DELETE' }));
}
for (const id of Object.values(ids.pipelines ?? {}).filter(Boolean)) {
  await quietly(`pipeline ${id}`, () => coreFetch(`pipelines/${id}`, { method: 'DELETE' }));
}

const drops = [...BUILD_ORDER].reverse().map((table) => `DROP TABLE IF EXISTS iceberg.${CURATED_DATABASE}.${table}`);
if (process.argv.includes('--drop-tables')) {
  const container = process.env.TRINO_CONTAINER ?? 'minder-sys-trino-coordinator-1';
  for (const statement of drops) {
    await quietly(statement, async () => execFileSync('docker', ['exec', container, 'trino', '--execute', statement], { stdio: 'pipe' }));
  }
} else {
  console.log('\nIceberg tables kept. To drop them on a deployed env, run as a catalog admin:');
  for (const statement of drops) console.log(`  ${statement};`);
}

writeIds({ charts: {}, dashboards: {}, pipelines: {}, automationWorkflows: {}, weatherAppended: false });
console.log('\nReset done. Kept (reused by the seeds): plant site, DB service, crawler, data workflows, MQTT adapter.');

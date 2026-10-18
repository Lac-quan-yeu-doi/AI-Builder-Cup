/**
 * Demo Data 2, phase 4 — creates the "Demo Data 2 – Coffee Capsules" collection and its charts.
 *
 * Every chart is checked twice. `validateCharts` runs first and needs nothing
 * but the definitions: it catches a visualization bound to a column the query
 * does not return, a table outside the curated contract, and a parameter
 * placeholder outside an optional block. Then, when the warehouse is actually
 * populated, each query is previewed against Trino and its real output columns
 * are compared with the declared `outputSchema` — so a column renamed in a
 * pipeline fails here rather than rendering a blank card on camera.
 *
 * `--dry-run` runs the static checks and stops, which is the useful mode before
 * the phase 3 pipelines (03-seed-data-platform.mjs) have been executed.
 *
 *   node mock-data/demo2-coffee-capsules/seed/04-seed-charts.mjs [--dry-run] [--trust-declared-schema]
 */
import { CHARTS, validateCharts } from '../charts.mjs';
import { BUILD_ORDER } from '../curated-schema.mjs';
import { coreFetch, readIds, writeIds } from '../ids.mjs';
import { DEMO } from '../reference.mjs';

const dryRun = process.argv.includes('--dry-run');
const trustDeclared = process.argv.includes('--trust-declared-schema');

const knownTables = new Set(BUILD_ORDER);
const problems = validateCharts(CHARTS, knownTables);
if (problems.length > 0) {
  throw new Error(`Chart definitions are inconsistent:\n  - ${problems.join('\n  - ')}`);
}
console.log(`${CHARTS.length} chart definitions pass static validation.`);
if (dryRun) process.exit(0);

// The collection every chart and dashboard is filed under.
const collections = await coreFetch('chart-collections');
const collection =
  (collections.items ?? collections).find?.((item) => item.name === DEMO.collectionName) ??
  (await coreFetch('chart-collections', {
    method: 'POST',
    body: { name: DEMO.collectionName },
  }));
console.log(`Collection ${DEMO.collectionName} (${collection.id})`);

const existing = await coreFetch(`chart-authoring/charts?collectionId=${collection.id}`);
const byTitle = new Map((existing.items ?? existing).map?.((item) => [item.title, item]) ?? []);

const created = {};
const deferred = [];

for (const chart of CHARTS) {
  const queryDefinition = {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: DEMO.database },
    parameters: chart.parameters,
    sql: chart.sql.trim(),
  };

  let outputSchema = chart.outputSchema;
  if (!trustDeclared) {
    try {
      const preview = await coreFetch('chart-authoring/query-previews', {
        method: 'POST',
        body: { query_definition: queryDefinition },
      });
      const actual = (preview.output_schema ?? preview.outputSchema ?? []).map((column) => ({
        name: column.name,
        type: column.type,
        family: column.family,
      }));
      if (actual.length > 0) {
        assertSchemaMatches(chart, actual);
        outputSchema = actual;
      }
      if ((preview.rows ?? []).length === 0) {
        console.log(`  ! ${chart.key} returned no rows — the card will be empty`);
      }
    } catch (error) {
      if (chart.requires !== undefined) {
        deferred.push(`${chart.key} (needs ${chart.requires})`);
        continue;
      }
      throw new Error(`Preview failed for ${chart.key}: ${error.message}`);
    }
  }

  const body = {
    title: chart.title,
    description: chart.description,
    collection_id: collection.id,
    query_definition: queryDefinition,
    visualization_definition: chart.visualization,
    output_schema: outputSchema,
  };
  const saved = byTitle.has(chart.title)
    ? await updateChart(byTitle.get(chart.title), body)
    : await coreFetch('chart-authoring/charts', { method: 'POST', body });
  created[chart.key] = saved.id;
  console.log(`  ${chart.key} → ${saved.id}`);
}

writeIds({ chartCollectionId: collection.id, charts: created });
console.log(`\n${Object.keys(created).length} charts ready in ${DEMO.collectionName}.`);
if (deferred.length > 0) {
  console.log(`Deferred until their table exists: ${deferred.join(', ')}`);
}

/**
 * Saves over an existing chart, refetching its revision if the listing was stale.
 *
 * The collection listing carries a revision number that a partial earlier run
 * can already have moved past, and Core answers a stale one with a 409 whose
 * message is the remedy: refetch and retry. Doing that here keeps a re-run
 * idempotent instead of leaving the seed half applied.
 */
async function updateChart(existingChart, body) {
  try {
    return await coreFetch(`chart-authoring/charts/${existingChart.id}`, {
      method: 'PUT',
      body: { ...body, expected_revision: existingChart.current_revision_number },
    });
  } catch (error) {
    if (!/CHART_VERSION_CONFLICT/u.test(error.message)) throw error;
    const current = await coreFetch(`chart-authoring/charts/${existingChart.id}`);
    return coreFetch(`chart-authoring/charts/${existingChart.id}`, {
      method: 'PUT',
      body: { ...body, expected_revision: current.current_revision_number },
    });
  }
}

/**
 * Compares what the query really returns with what the definition promised.
 *
 * A missing column is fatal — the visualization binds it. An extra column is
 * only worth a note: the query returning more than the chart draws is a normal
 * way to carry a comparison value or a sort key.
 */
function assertSchemaMatches(chart, actual) {
  const declared = new Set(chart.outputSchema.map((column) => column.name));
  const returned = new Set(actual.map((column) => column.name));
  const missing = [...declared].filter((name) => !returned.has(name));
  if (missing.length > 0) {
    throw new Error(
      `${chart.key}: declared columns ${missing.join(', ')} are not in the query result ` +
        `(${[...returned].join(', ')}).`,
    );
  }
  const extra = [...returned].filter((name) => !declared.has(name));
  if (extra.length > 0) console.log(`  · ${chart.key} also returns ${extra.join(', ')}`);
}

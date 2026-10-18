/**
 * Phase 4 — creates the six dashboards, wires their filters, and files them
 * against the plant site so the model page opens on the board the leadership
 * team actually want.
 *
 * Checks run in three places, because a dashboard fails quietly in three
 * different ways:
 *
 *  - `validateDashboards` catches overlapping cards, a row wider than the grid,
 *    and a card pointing at a chart that does not exist.
 *  - the mappings are derived from each chart's own parameters, so a filter can
 *    never target a variable its chart does not declare. Core validates the
 *    shape of a mapping on save but not the variable, so nothing else would
 *    catch it.
 *  - after saving, every dashboard is executed and every card asserted to
 *    return rows. A card whose SQL drifted from a pipeline column renders empty
 *    rather than erroring, which is the single most likely on-camera failure.
 *
 *   node mock-data/demo1-home-appliance/seed/04-seed-dashboards.mjs [--dry-run] [--skip-execute]
 */
import { CHARTS } from '../charts.mjs';
import { DASHBOARDS, buildDashboard, validateDashboards } from '../dashboards.mjs';
import { DEMO, coreFetch, readIds, writeIds } from '../ids.mjs';

const dryRun = process.argv.includes('--dry-run');
const skipExecute = process.argv.includes('--skip-execute');

const problems = validateDashboards();
if (problems.length > 0) {
  throw new Error(`Dashboard definitions are inconsistent:\n  - ${problems.join('\n  - ')}`);
}
console.log(`${DASHBOARDS.length} dashboard definitions pass static validation.`);
if (dryRun) process.exit(0);

const ids = readIds();
if (ids.chartCollectionId === undefined || ids.charts === undefined) {
  throw new Error('Run 03-seed-charts.mjs first — its chart ids are the input to this script.');
}
if (ids.plantSiteId === undefined) {
  throw new Error('Run 01-seed-plant-site.mjs first — the dashboards are filed against that site.');
}
const availableCharts = new Map(Object.entries(ids.charts));
const missing = CHARTS.filter((chart) => !availableCharts.has(chart.key)).map((chart) => chart.key);
if (missing.length > 0)
  console.log(`Charts not yet created, their cards will be dropped: ${missing.join(', ')}`);

/*
 * Stand every association down from default before re-associating.
 *
 * The site allows exactly one default dashboard and enforces it with a unique
 * index, so promoting a new board while the old one still holds the flag fails
 * on whichever PUT happens to land second.
 */
const associations = await coreFetch(`plant-sites/${ids.plantSiteId}/dashboards`).catch(() => []);
for (const association of associations) {
  if (!association.isDefault) continue;
  await coreFetch(`plant-sites/${ids.plantSiteId}/dashboards/${association.dashboardId}`, {
    method: 'PUT',
    body: { role: association.role, displayOrder: association.displayOrder, isDefault: false },
  });
}

const existing = await coreFetch(`dashboards?collectionId=${ids.chartCollectionId}`);
const byName = new Map((existing.items ?? existing).map?.((item) => [item.name, item]) ?? []);
const saved = {};

for (const [order, spec] of DASHBOARDS.entries()) {
  const dashboard =
    byName.get(spec.name) ??
    (await coreFetch('dashboards', {
      method: 'POST',
      body: {
        name: spec.name,
        description: spec.description,
        collection_id: ids.chartCollectionId,
      },
    }));
  /* Ids are scoped to the dashboard row so a replaced board cannot collide with
     the archived one it succeeded. */
  const built = buildDashboard(spec, availableCharts, dashboard.id);

  const stored = await coreFetch(`dashboards/${dashboard.id}`, {
    method: 'PUT',
    body: {
      expected_revision: dashboard.expected_revision,
      collection_id: ids.chartCollectionId,
      name: spec.name,
      description: spec.description,
      tabs: built.tabs,
      cards: built.cards,
      filters: built.filters,
      mappings: built.mappings,
    },
  });
  saved[spec.key] = { id: dashboard.id, tabId: built.tabs[0].id };

  await coreFetch(`plant-sites/${ids.plantSiteId}/dashboards/${dashboard.id}`, {
    method: 'PUT',
    body: { role: spec.role, displayOrder: order, isDefault: spec.isDefault },
  });

  console.log(
    `  ${spec.name} — ${built.cards.length} cards, ${built.filters.length} filters, ` +
      `${built.mappings.length} mappings, role ${spec.role}${spec.isDefault ? ' (default)' : ''}` +
      `${built.skipped.length === 0 ? '' : `, dropped ${built.skipped.join(', ')}`}` +
      ` · revision ${stored.expected_revision}`,
  );
}

writeIds({ dashboards: saved });

if (skipExecute) {
  console.log('\n--skip-execute: dashboards saved but not rendered.');
} else {
  console.log('\nRendering every card:');
  let empty = 0;
  for (const spec of DASHBOARDS) {
    const entry = saved[spec.key];
    const result = await coreFetch(`dashboards/${entry.id}/execute`, {
      method: 'POST',
      body: { tab_id: entry.tabId, values: {} },
    });
    for (const card of result.cards ?? []) {
      /* Core nests the payload: `card.result.rows`, with `card.state` beside it. */
      if (card.state !== 'SUCCESS') {
        throw new Error(
          `${spec.name}: card ${card.card_id} is ${card.state} — ` +
            JSON.stringify(card.error ?? card.result ?? {}),
        );
      }
      const rows = card.result?.rowCount ?? card.result?.rows?.length ?? 0;
      if (rows === 0) {
        empty += 1;
        console.log(`  ! ${spec.name}: card ${card.card_id} returned no rows`);
      }
    }
    console.log(`  ${spec.name}: ${(result.cards ?? []).length} cards rendered`);
  }
  if (empty > 0) {
    throw new Error(
      `${empty} card(s) returned no rows. An empty card on a projector reads as a broken product; ` +
        'fix the query or the data before the rehearsal.',
    );
  }
}

console.log(`\nDashboards ready in ${DEMO.collectionName}.`);
console.log(
  `Open /plant-model/${ids.plantSiteId}/overview — the default board renders inline there.`,
);

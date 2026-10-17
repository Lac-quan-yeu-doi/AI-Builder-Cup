/**
 * Phase 1 — creates the Demo Data 1 (Home Appliance) plant site, applies the
 * chest-freezer plant template, and publishes version 1.
 *
 * Idempotent: a second run reuses the existing site, skips the template when a
 * draft is already there, and skips the publish when the current revision is
 * the published one — so it is safe to re-run between rehearsals.
 *
 *   node mock-data/demo1-home-appliance/seed/01-seed-plant-site.mjs
 *
 * Targets the local compose stack by default; set CELESNITY_CORE_URL and
 * CELESNITY_ACCESS_TOKEN to seed a deployed environment instead.
 */
import { DEMO, coreFetch, writeIds } from '../ids.mjs';

const sites = await coreFetch('plant-sites');
const found = sites.find((site) => site.code.toLowerCase() === DEMO.siteCode.toLowerCase());

let site =
  found === undefined
    ? await coreFetch('plant-sites', {
        method: 'POST',
        body: { name: DEMO.siteName, code: DEMO.siteCode, timezone: DEMO.timezone },
      })
    : await coreFetch(`plant-sites/${found.id}/model`);
console.log(
  found === undefined ? `Created plant site ${site.id}` : `Reusing plant site ${site.id}`,
);

if (site.draft.nodes.length === 0) {
  site = await coreFetch(`plant-sites/${site.id}/model/template-applications`, {
    method: 'POST',
    body: { templateId: DEMO.templateId, expectedRevision: site.revision },
  });
  console.log(
    `Applied template ${DEMO.templateId}: ${site.draft.nodes.length} nodes, ` +
      `${site.draft.relationships.filter((edge) => edge.kind === 'routes-to').length} routes`,
  );
} else {
  console.log(`Draft already holds ${site.draft.nodes.length} nodes; template not reapplied.`);
}

if (site.publishedRevision === site.revision) {
  console.log(
    `Revision ${site.revision} is already published as version ${site.latestPublishedVersion}.`,
  );
} else {
  site = await coreFetch(`plant-sites/${site.id}/model/publish`, {
    method: 'POST',
    body: { expectedRevision: site.revision, note: 'Initial release – Demo Data 1 (Home Appliance)' },
  });
  console.log(`Published version ${site.latestPublishedVersion}`);
}

writeIds({ plantSiteId: site.id });
console.log(`Plant site ready: ${DEMO.siteName} (${site.id})`);

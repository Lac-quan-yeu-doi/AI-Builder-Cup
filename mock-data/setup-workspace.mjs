/**
 * Prepares a freshly bootstrapped organization for the demo seeds. Run once,
 * after the organization exists (see mock-data/SEEDING.md) and before any
 * demo's seed scripts. Idempotent.
 *
 *  1. Catalog read access for the organization's BACKGROUND and AGENT service
 *     identities. Pipelines run as the background identity, and a pipeline that
 *     reads a curated Iceberg table (the derived OEE, health and risk tables)
 *     fails with SOURCE_ACCESS_DENIED without it. A new organization grants
 *     catalog access only to its owners.
 *  2. The agent manifests from minder-agent/agents/. Outside production the
 *     agent has no built-in fallback, so a new organization's chat fails with
 *     `agent_manifest_not_found` until they are saved. Existing manifests are
 *     left alone.
 *
 *   node mock-data/setup-workspace.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';

import { agentFetch, coreFetch } from './lib/http.mjs';

const READ = ['DISCOVER', 'DESCRIBE', 'PREVIEW', 'SELECT'];

// 1 ─ catalog read access for the service identities.
const identities = await coreFetch('administration/authorization/service-identities');
const grants = await coreFetch('administration/authorization/catalog-grants');
for (const purpose of ['BACKGROUND', 'AGENT']) {
  const identity = identities.find((item) => item.purpose === purpose);
  if (identity === undefined) throw new Error(`The organization has no ${purpose} service identity.`);
  const granted = grants.some(
    (grant) =>
      grant.identityId === identity.identityId &&
      grant.resourceType === 'CATALOG' &&
      grant.resourceId === '*' &&
      grant.effect === 'ALLOW' &&
      READ.every((permission) => grant.permissions.includes(permission)),
  );
  if (granted) {
    console.log(`${purpose} service identity: catalog read access already granted`);
    continue;
  }
  await coreFetch('administration/authorization/catalog-grants', {
    method: 'POST',
    body: {
      identityId: identity.identityId,
      resourceType: 'CATALOG',
      resourceId: '*',
      permissions: READ,
      effect: 'ALLOW',
      includeDescendants: true,
      grantOption: false,
    },
  });
  console.log(`${purpose} service identity: granted catalog read access`);
}

// 2 ─ agent manifests.
const agentsDir = new URL('../minder-agent/agents/', import.meta.url);
const saved = new Set((await agentFetch('/agent-manifests')).map((manifest) => manifest.name));
for (const file of readdirSync(agentsDir).filter((name) => name.endsWith('.yaml')).sort()) {
  const name = file.replace(/\.yaml$/u, '');
  if (name === 'template') continue;
  if (saved.has(name)) {
    console.log(`agent ${name}: already installed`);
    continue;
  }
  await agentFetch(`/agent-manifests/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ yaml: readFileSync(new URL(file, agentsDir), 'utf8') }),
  });
  console.log(`agent ${name}: installed`);
}

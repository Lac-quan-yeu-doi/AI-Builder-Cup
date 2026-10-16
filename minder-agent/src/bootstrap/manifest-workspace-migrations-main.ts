import { parse } from "yaml";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { createManifestLoader } from "@application/agent/configuration/manifest-loader.js";
import { createManifestWorkspaceMigrator } from "@application/agent/configuration/manifest-workspace-migrations.js";
import { organizationScopeKey } from "@domain/index.js";
import { loadManifestMigrationFiles } from "@infrastructure/agent/manifest-migration-files.js";
import { createCoreWorkloadIdentityFetch } from "@infrastructure/mcp/transport/core-workload-identity.js";
import {
  createS3ManifestWorkspace,
  createS3WorkspaceProviderFromEnvironment,
} from "@infrastructure/workspace/index.js";

const core = process.env.CELESNITY_CORE_URL?.trim();
const audience = process.env.CELESNITY_CORE_AUDIENCE?.trim();
if (!core || !audience)
  throw new Error("Core organization inventory URL and audience are required.");
const url = new URL("/api/v1/internal/agent-manifest-organizations", core);
const response = await createCoreWorkloadIdentityFetch(audience, fetch)(url, {
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(`Core organization inventory failed: ${response.status}`);
const inventory: unknown = await response.json();
if (!Array.isArray(inventory) || inventory.length === 0)
  throw new Error("Core organization inventory is empty or invalid.");
const owners = inventory.map((value: unknown) => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("organizationId" in value) ||
    typeof value.organizationId !== "string" ||
    !/^[0-9a-f-]{36}$/iu.test(value.organizationId) ||
    !("identityTenantId" in value) ||
    typeof value.identityTenantId !== "string"
  )
    throw new Error("Core organization inventory contains an invalid binding.");
  return organizationScopeKey({
    organizationId: value.organizationId,
    identityTenantId: value.identityTenantId,
  });
});
if (new Set(owners).size !== owners.length)
  throw new Error("Core organization inventory contains duplicate bindings.");
const migrations = await loadManifestMigrationFiles();
const workspace = createS3ManifestWorkspace(
  await createS3WorkspaceProviderFromEnvironment(process.env),
);
const loader = createManifestLoader({
  workspace,
  parseYaml: parse,
  environment: process.env,
  sha256,
});
const migrator = createManifestWorkspaceMigrator({ workspace, loader, sha256 });
for (const owner of owners) {
  const results = await migrator.migrate(owner, migrations);
  for (const result of results)
    process.stdout.write(
      `Agent manifest migration ${result.id}: ${result.status}, ${result.created.length} created, ${result.preserved.length} preserved.\n`,
    );
}
process.stdout.write(
  `Agent manifest migrations verified for ${owners.length} active organizations.\n`,
);

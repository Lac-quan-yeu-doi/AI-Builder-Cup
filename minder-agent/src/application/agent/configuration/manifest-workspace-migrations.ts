import type { Sha256 } from "@application/shared/ports/index.js";
import type { ManifestLoader, ManifestWorkspace } from "./manifest-loader.js";

export interface ManifestMigrationAsset {
  readonly name: string;
  readonly sha256: string;
  readonly yaml: string;
}

export interface ManifestWorkspaceMigration {
  readonly id: string;
  readonly assets: readonly ManifestMigrationAsset[];
}

export interface ManifestWorkspaceMigrationResult {
  readonly id: string;
  readonly status: "applied" | "already-applied";
  readonly created: readonly string[];
  readonly preserved: readonly string[];
}

const migrationIdPattern = /^[0-9]{14}_[a-z0-9-]+$/u;
const assetNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

/** Apply immutable, create-only organization manifest migrations in order. */
export function createManifestWorkspaceMigrator(input: {
  readonly workspace: ManifestWorkspace;
  readonly loader: ManifestLoader;
  readonly sha256: Sha256;
}) {
  return {
    async migrate(
      owner: string,
      migrations: readonly ManifestWorkspaceMigration[],
    ): Promise<readonly ManifestWorkspaceMigrationResult[]> {
      if (!owner.trim())
        throw new Error("Manifest migration owner is required.");
      const ids = migrations.map((migration) => migration.id);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !migrationIdPattern.test(id))
      )
        throw new Error("Manifest migration IDs must be unique and valid.");
      if (ids.some((id, index) => index > 0 && id <= (ids[index - 1] ?? "")))
        throw new Error("Manifest migrations must be ordered.");

      const results: ManifestWorkspaceMigrationResult[] = [];
      for (const migration of migrations) {
        const markerPath = `.migrations/agent-manifests/${migration.id}.json`;
        const names = migration.assets.map((asset) => asset.name);
        if (names.length === 0 || new Set(names).size !== names.length)
          throw new Error(
            `Manifest migration has missing or duplicate assets: ${migration.id}`,
          );
        for (const asset of migration.assets) {
          if (
            !assetNamePattern.test(asset.name) ||
            !digestPattern.test(asset.sha256)
          )
            throw new Error(
              `Invalid manifest migration asset: ${migration.id}`,
            );
          if (input.sha256(asset.yaml) !== asset.sha256)
            throw new Error(
              `Manifest migration asset changed: ${migration.id}/${asset.name}`,
            );
        }
        const expectedMarker = JSON.stringify({
          id: migration.id,
          assets: migration.assets.map(({ name, sha256 }) => ({
            name,
            sha256,
          })),
        });
        const marker = await input.workspace.read(owner, markerPath);
        if (marker !== undefined) {
          if (marker !== expectedMarker)
            throw new Error(
              `Manifest migration marker conflicts: ${migration.id}`,
            );
          results.push({
            id: migration.id,
            status: "already-applied",
            created: [],
            preserved: [],
          });
          continue;
        }

        const created: string[] = [];
        const preserved: string[] = [];
        const missing: ManifestMigrationAsset[] = [];
        // Validate the entire migration before writing. Existing organization edits win.
        for (const asset of migration.assets) {
          const candidate = await input.loader.validate({
            owner,
            yaml: asset.yaml,
          });
          if (candidate.name !== asset.name)
            throw new Error(
              `Manifest migration name is invalid: ${migration.id}/${asset.name}`,
            );
          const existing = await input.workspace.read(
            owner,
            `agents/${asset.name}.yaml`,
          );
          if (existing === undefined) {
            missing.push(asset);
          } else {
            const current = await input.loader.validate({
              owner,
              yaml: existing,
            });
            if (current.name !== asset.name)
              throw new Error(
                `Organization Agent manifest name is invalid: ${asset.name}`,
              );
            preserved.push(asset.name);
          }
        }
        for (const asset of missing) {
          await input.loader.save({
            owner,
            name: asset.name,
            yaml: asset.yaml,
          });
          created.push(asset.name);
        }
        // A failed write leaves no marker; retry fills only missing assets.
        await input.workspace.write(owner, markerPath, expectedMarker);
        results.push({
          id: migration.id,
          status: "applied",
          created,
          preserved,
        });
      }
      return results;
    },
  };
}

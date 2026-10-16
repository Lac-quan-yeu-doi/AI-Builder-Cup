import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ManifestWorkspaceMigration } from "@application/agent/configuration/manifest-workspace-migrations.js";

export async function loadManifestMigrationFiles(
  directory = join(process.cwd(), "migrations", "agent-manifests"),
): Promise<readonly ManifestWorkspaceMigration[]> {
  const files = (await readdir(directory))
    .filter((name) => /^[0-9]{14}_[a-z0-9-]+\.json$/u.test(name))
    .sort();
  const migrations: ManifestWorkspaceMigration[] = [];
  for (const file of files) {
    const definition: unknown = JSON.parse(
      await readFile(join(directory, file), "utf8"),
    );
    if (
      typeof definition !== "object" ||
      definition === null ||
      !("id" in definition) ||
      typeof definition.id !== "string" ||
      `${definition.id}.json` !== file ||
      !("assets" in definition) ||
      !Array.isArray(definition.assets)
    )
      throw new Error(`Invalid Agent manifest migration file: ${file}`);
    const id = definition.id;
    const assets = await Promise.all(
      definition.assets.map(async (asset: unknown) => {
        if (
          typeof asset !== "object" ||
          asset === null ||
          !("name" in asset) ||
          typeof asset.name !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(asset.name) ||
          !("sha256" in asset) ||
          typeof asset.sha256 !== "string" ||
          !("source" in asset) ||
          typeof asset.source !== "string" ||
          asset.source !== `${id}/${asset.name}.yaml`
        )
          throw new Error(`Invalid Agent manifest migration asset: ${file}`);
        return {
          name: asset.name,
          sha256: asset.sha256,
          yaml: await readFile(join(directory, asset.source), "utf8"),
        };
      }),
    );
    migrations.push({ id, assets });
  }
  if (migrations.length === 0)
    throw new Error("No Agent manifest migrations were bundled.");
  return migrations;
}

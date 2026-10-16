import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  createManifestLoader,
  type ManifestWorkspace,
} from "@application/agent/configuration/manifest-loader.js";
import {
  createManifestWorkspaceMigrator,
  type ManifestWorkspaceMigration,
} from "@application/agent/configuration/manifest-workspace-migrations.js";
import { createMigratingManifestLoader } from "@application/agent/configuration/migrating-manifest-loader.js";
import { loadManifestMigrationFiles } from "@infrastructure/agent/manifest-migration-files.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";

const migrationId = "20260926160000_builtin-agents";

function fixture() {
  const values = new Map<string, string>();
  const workspace: ManifestWorkspace = {
    async list(owner, prefix) {
      return [...values.keys()]
        .filter((key) => key.startsWith(`${owner}:${prefix}`))
        .map((key) => key.slice(owner.length + 1));
    },
    async read(owner, path) {
      return values.get(`${owner}:${path}`);
    },
    async write(owner, path, content) {
      values.set(`${owner}:${path}`, content);
    },
    async remove(owner, path) {
      values.delete(`${owner}:${path}`);
    },
  };
  const loader = createManifestLoader({
    workspace,
    parseYaml: parse,
    sha256,
    environment: {
      MCP_SHARED_SECRET: "synthetic-secret",
      TRINO_MCP_URL: "http://core.test/trino-mcp",
      CHART_MCP_URL: "http://core.test/chart-mcp",
      DOCUMENT_MCP_URL: "http://core.test/document-mcp",
      PLANT_MODEL_MCP_URL: "http://core.test/plant-model-mcp",
      AUTOMATION_WORKFLOW_MCP_URL: "http://core.test/automation-workflow-mcp",
      SKILL_MCP_URL: "http://core.test/skill-mcp",
    },
  });
  return {
    values,
    workspace,
    loader,
    migrator: createManifestWorkspaceMigrator({ workspace, loader, sha256 }),
  };
}

async function bundledMigration(): Promise<ManifestWorkspaceMigration> {
  const definition = JSON.parse(
    await readFile(
      join(process.cwd(), "migrations/agent-manifests", `${migrationId}.json`),
      "utf8",
    ),
  ) as {
    readonly id: string;
    readonly assets: readonly {
      readonly name: string;
      readonly source: string;
      readonly sha256: string;
    }[];
  };
  return {
    id: definition.id,
    assets: await Promise.all(
      definition.assets.map(async ({ name, source, sha256 }) => ({
        name,
        sha256,
        yaml: await readFile(
          join(process.cwd(), "migrations/agent-manifests", source),
          "utf8",
        ),
      })),
    ),
  };
}

describe("Agent manifest workspace migrations", () => {
  it("initializes celesnity and kasa independently, including organizations first accessed after deployment", async () => {
    const { loader, migrator, values } = fixture();
    const migrations = await loadManifestMigrationFiles();
    const initialized: string[] = [];
    const runtimeLoader = createMigratingManifestLoader(
      loader,
      async (owner) => {
        initialized.push(owner);
        await migrator.migrate(owner, migrations);
      },
    );
    await expect(
      runtimeLoader.get({ owner: "celesnity", name: "chat-assistant" }),
    ).resolves.toMatchObject({ name: "chat-assistant" });
    expect(values.has("kasa:agents/chat-assistant.yaml")).toBe(false);
    await expect(
      runtimeLoader.get({ owner: "kasa", name: "chat-assistant" }),
    ).resolves.toMatchObject({ name: "chat-assistant" });
    await Promise.all([runtimeLoader.list("kasa"), runtimeLoader.list("kasa")]);
    expect(initialized).toEqual(["celesnity", "kasa"]);
    expect(values.has("kasa:agents/chat-assistant.yaml")).toBe(true);
  });

  it("does not hide a failed initialization and retries on the next request", async () => {
    const { loader } = fixture();
    let attempts = 0;
    const runtimeLoader = createMigratingManifestLoader(loader, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("storage unavailable");
    });
    await expect(runtimeLoader.list("kasa")).rejects.toThrow(
      "storage unavailable",
    );
    await expect(runtimeLoader.list("kasa")).resolves.toEqual([]);
    expect(attempts).toBe(2);
  });
  it("applies the checked-in migration and records it for only the approved organization", async () => {
    const { values, loader, migrator } = fixture();
    const migration = await bundledMigration();
    expect(
      (await migrator.migrate("organization-a", [migration]))[0],
    ).toMatchObject({
      id: migrationId,
      status: "applied",
      created: migration.assets.map((asset) => asset.name),
    });
    expect(
      (await loader.list("organization-a")).map((entry) => entry.name).sort(),
    ).toEqual(migration.assets.map((asset) => asset.name).sort());
    expect(
      values.has(
        `organization-a:.migrations/agent-manifests/${migrationId}.json`,
      ),
    ).toBe(true);
    expect(values.has("organization-b:agents/chat-assistant.yaml")).toBe(false);
    expect(
      (await migrator.migrate("organization-a", [migration]))[0]?.status,
    ).toBe("already-applied");
  });

  it("preserves edits, resumes partial work, and does not recreate intentionally deleted agents after completion", async () => {
    const { values, migrator } = fixture();
    const migration = await bundledMigration();
    const first = migration.assets[0];
    if (!first) throw new Error("missing fixture asset");
    const edited = `${first.yaml}\n# organization edit`;
    values.set(`organization-a:agents/${first.name}.yaml`, edited);
    const result = (await migrator.migrate("organization-a", [migration]))[0];
    expect(result?.preserved).toContain(first.name);
    expect(values.get(`organization-a:agents/${first.name}.yaml`)).toBe(edited);
    values.delete(`organization-a:agents/${first.name}.yaml`);
    await migrator.migrate("organization-a", [migration]);
    expect(values.has(`organization-a:agents/${first.name}.yaml`)).toBe(false);
  });

  it("rejects changed assets and conflicting markers before changing manifests", async () => {
    const { values, migrator } = fixture();
    const migration = await bundledMigration();
    const asset = migration.assets[0];
    if (!asset) throw new Error("missing fixture asset");
    const tampered = {
      ...migration,
      assets: [{ ...asset, yaml: `${asset.yaml}\n# changed` }],
    };
    await expect(
      migrator.migrate("organization-a", [tampered]),
    ).rejects.toThrow("Manifest migration asset changed");
    expect(values.size).toBe(0);
    values.set(
      `organization-a:.migrations/agent-manifests/${migrationId}.json`,
      "wrong",
    );
    await expect(
      migrator.migrate("organization-a", [migration]),
    ).rejects.toThrow("Manifest migration marker conflicts");
  });

  it("validates the complete migration before writing and retries a partial application", async () => {
    const { values, migrator } = fixture();
    const migration = await bundledMigration();
    const invalid = {
      ...migration,
      assets: [
        ...migration.assets,
        {
          name: "different-name",
          yaml: "name: incorrect-name",
          sha256: sha256("name: incorrect-name"),
        },
      ],
    };
    await expect(
      migrator.migrate("organization-a", [invalid]),
    ).rejects.toThrow();
    expect(values.size).toBe(0);
    const first = migration.assets[0];
    if (!first) throw new Error("missing fixture asset");
    values.set(`organization-a:agents/${first.name}.yaml`, first.yaml);
    const result = (await migrator.migrate("organization-a", [migration]))[0];
    expect(result?.preserved).toContain(first.name);
    expect(result?.created).toHaveLength(migration.assets.length - 1);
  });
});

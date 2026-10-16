import { organizationScopeKey } from "@domain/index.js";
import {
  createAgentManifestMigration,
  type AgentManifestInventory,
  type ManifestMigrationWorkspace,
} from "../../../presentation/cli/agent-manifest-migration.js";
import { describe, expect, it } from "vitest";

const inventory: AgentManifestInventory = {
  version: 1,
  generated_at: "2026-09-19T00:00:00.000Z",
  members: [
    {
      organization_id: "org-a",
      identity_tenant_id: "tenant-a",
      subject: "alice",
      legacy_owner: "legacy-alice",
    },
    {
      organization_id: "org-a",
      identity_tenant_id: "tenant-a",
      subject: "bob",
      legacy_owner: "legacy-bob",
    },
  ],
};

const writerManifest = `
name: writer
description: Writes reports.
system_prompt:
  file: prompts/writer.md
tools:
  mode: allowlist
  names: [Read]
execution:
  mode: interactive
  max_iterations: 8
`;

function workspaceFor(entries: Record<string, string>): {
  workspace: ManifestMigrationWorkspace;
  values: Map<string, string>;
  writes: string[];
} {
  const values = new Map(Object.entries(entries));
  const writes: string[] = [];
  return {
    values,
    writes,
    workspace: {
      async list(owner, prefix) {
        return [...values.keys()]
          .filter((key) => key.startsWith(`${owner}:`))
          .map((key) => key.slice(owner.length + 1))
          .filter((path) => path.startsWith(prefix));
      },
      async read(owner, path) {
        return values.get(`${owner}:${path}`);
      },
      async write(owner, path, content) {
        writes.push(`${owner}:${path}`);
        values.set(`${owner}:${path}`, content);
      },
    },
  };
}

describe("agent manifest migration", () => {
  it("copies a complete prompt closure, deduplicates identical sources, and marks cutover", async () => {
    const fixture = workspaceFor({
      [`legacy-alice:agents/writer.yaml`]: writerManifest,
      [`legacy-alice:prompts/writer.md`]: "Write concise reports.",
      [`legacy-bob:agents/writer.yaml`]: writerManifest,
      [`legacy-bob:prompts/writer.md`]: "Write concise reports.",
    });
    const migration = createAgentManifestMigration({
      workspace: fixture.workspace,
      now: () => "2026-09-19T01:00:00.000Z",
    });

    const dryRun = await migration.migrate({ inventory, mode: "dry-run" });
    expect(dryRun.entries).toMatchObject([
      {
        organizationId: "org-a",
        manifestName: "writer",
        action: "copied",
        sourceLegacyOwners: ["legacy-alice", "legacy-bob"],
      },
    ]);
    expect(fixture.writes).toEqual([]);

    const applied = await migration.migrate({ inventory, mode: "apply" });
    expect(applied.entries[0]?.action).toBe("copied");
    expect(
      fixture.values.get(
        `${organizationScopeKey({
          identityTenantId: "tenant-a",
          organizationId: "org-a",
        })}:agents/writer.yaml`,
      ),
    ).toBe(writerManifest);
    expect(
      fixture.values.has(
        `${organizationScopeKey({
          identityTenantId: "tenant-a",
          organizationId: "org-a",
        })}:.minder-agent-manifest-cutover.json`,
      ),
    ).toBe(true);

    const retried = await migration.migrate({ inventory, mode: "apply" });
    expect(retried.entries[0]?.action).toBe("deduplicated");
  });

  it("blocks same-name conflicts and verify reports missing targets", async () => {
    const fixture = workspaceFor({
      [`legacy-alice:agents/writer.yaml`]: writerManifest,
      [`legacy-alice:prompts/writer.md`]: "Write concise reports.",
      [`legacy-bob:agents/writer.yaml`]: writerManifest,
      [`legacy-bob:prompts/writer.md`]: "Write detailed reports.",
    });
    const migration = createAgentManifestMigration({
      workspace: fixture.workspace,
      now: () => "2026-09-19T01:00:00.000Z",
    });

    const conflict = await migration.migrate({ inventory, mode: "apply" });
    expect(conflict.entries[0]?.action).toBe("conflict");
    expect(fixture.writes).not.toContain(
      `${organizationScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
      })}:agents/writer.yaml`,
    );

    const missingFixture = workspaceFor({
      [`legacy-alice:agents/writer.yaml`]: writerManifest,
      [`legacy-alice:prompts/writer.md`]: "Write concise reports.",
    });
    const verify = await createAgentManifestMigration({
      workspace: missingFixture.workspace,
    }).verify({
      inventory: { ...inventory, members: [inventory.members[0]!] },
    });
    expect(verify.entries[0]?.action).toBe("missing");
    expect(verify.cutoverReady).toBe(false);
  });
});

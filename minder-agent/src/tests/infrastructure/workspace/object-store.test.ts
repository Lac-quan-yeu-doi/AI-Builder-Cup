import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RoomId } from "@domain/index.js";
import type {
  FileAccessPort,
  FileAccessRecord,
} from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  createLocalWorkspacePort,
  createObjectWorkspacePort,
  createMemoryObjectStoreClient,
  type WorkspacePort,
} from "@infrastructure/workspace/index.js";

const roomId = "room-one" as RoomId;

function recorder(): FileAccessPort & { records: FileAccessRecord[] } {
  const records: FileAccessRecord[] = [];
  return {
    records,
    async record(access) {
      records.push(access);
    },
    async list(runId) {
      return records.filter((record) => record.runId === runId);
    },
  };
}

async function adapter(
  kind: "local" | "object-store",
  fileAccess?: FileAccessPort,
): Promise<WorkspacePort> {
  if (kind === "local") {
    const baseDirectory = await mkdtemp(join(tmpdir(), "minder-workspace-"));
    return createLocalWorkspacePort({
      baseDirectory,
      ...(fileAccess ? { fileAccess, runId: "run-1" as never } : {}),
    });
  }
  const client = createMemoryObjectStoreClient();
  return createObjectWorkspacePort({
    client,
    bucket: "workspace",
    ...(fileAccess ? { fileAccess, runId: "run-1" as never } : {}),
  });
}

describe("workspace path parity", () => {
  it.each(["local", "object-store"] as const)(
    "rejects an escaping path in %s",
    async (kind) => {
      const workspace = await adapter(kind);
      await workspace.ensure(roomId);
      await expect(
        workspace.read({ roomId, path: "../secret" }),
      ).rejects.toThrow("outside the workspace");
    },
  );

  it("reads object content and records provenance", async () => {
    const client = createMemoryObjectStoreClient();
    const access = recorder();
    const workspace = createObjectWorkspacePort({
      client,
      bucket: "workspace",
      fileAccess: access,
      runId: "run-1" as never,
    });
    await workspace.ensure(roomId);
    await client.putObject(
      "workspace",
      "room-one/notes.txt",
      new TextEncoder().encode("hello"),
    );

    const content = await workspace.read({ roomId, path: "notes.txt" });
    expect(new TextDecoder().decode(content.content)).toBe("hello");
    expect(access.records).toHaveLength(1);
    expect(access.records[0]).toMatchObject({
      path: "notes.txt",
      operation: "read",
    });
  });

  it("isolates object keys by principal scope so foreign scopes cannot read", async () => {
    const client = createMemoryObjectStoreClient();
    const scopeA = {
      identityTenantId: "tenant-a",
      organizationId: "org-a",
      identityId: "alice",
    };
    const scopeB = {
      identityTenantId: "tenant-a",
      organizationId: "org-b",
      identityId: "alice",
    };
    const ownerA = createObjectWorkspacePort({
      client,
      bucket: "workspace",
      scope: scopeA,
    });
    const ownerB = createObjectWorkspacePort({
      client,
      bucket: "workspace",
      scope: scopeB,
    });
    const prefixA = await ownerA.ensure(roomId);
    const prefixB = await ownerB.ensure(roomId);
    expect(prefixA).not.toBe(prefixB);

    await client.putObject(
      "workspace",
      `${prefixA}notes.txt`,
      new TextEncoder().encode("secret-a"),
    );

    // Owner A can read its own object.
    await expect(
      ownerA.read({ roomId, path: "notes.txt" }),
    ).resolves.toMatchObject({ path: "notes.txt" });
    // Owner B, a different organization, sees no object at the same room+path.
    await expect(ownerB.read({ roomId, path: "notes.txt" })).rejects.toThrow(
      "not a file",
    );
  });
});

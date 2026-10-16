import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createMemoryS3WorkspaceStorage,
  createS3ManifestWorkspace,
  createS3WorkspaceProvider,
  createS3WorkspaceProviderFromEnvironment,
} from "@infrastructure/workspace/index.js";

describe("S3 workspace provider", () => {
  it("resolves manifest working directories inside the cached workspace", async () => {
    const storage = createMemoryS3WorkspaceStorage();
    const cache = await mkdtemp(join(tmpdir(), "minder-s3-workspace-path-"));
    const provider = createS3WorkspaceProvider({
      storage,
      cacheDirectory: cache,
    });

    try {
      const workspace = await provider.resolve("owner", "session");
      await expect(
        provider.resolvePath(workspace.root, "reports/daily"),
      ).resolves.toBe(join(workspace.root, "reports", "daily"));
      await expect(
        provider.resolvePath(workspace.root, "../outside"),
      ).rejects.toThrow("outside the workspace");
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("persists tenant manifest files in S3 without exposing them to another owner", async () => {
    const storage = createMemoryS3WorkspaceStorage();
    const cacheA = await mkdtemp(join(tmpdir(), "minder-s3-manifest-a-"));
    const cacheB = await mkdtemp(join(tmpdir(), "minder-s3-manifest-b-"));
    const first = createS3ManifestWorkspace(
      createS3WorkspaceProvider({ storage, cacheDirectory: cacheA }),
    );
    const second = createS3ManifestWorkspace(
      createS3WorkspaceProvider({ storage, cacheDirectory: cacheB }),
    );

    try {
      await first.write("tenant-a", "agents/writer.yaml", "name: writer\n");

      await expect(second.list("tenant-a", "agents/")).resolves.toEqual([
        "agents/writer.yaml",
      ]);
      await expect(second.read("tenant-a", "agents/writer.yaml")).resolves.toBe(
        "name: writer\n",
      );
      await expect(second.list("tenant-b", "agents/")).resolves.toEqual([]);
    } finally {
      await rm(cacheA, { recursive: true, force: true });
      await rm(cacheB, { recursive: true, force: true });
    }
  });

  it("restores one room workspace in a fresh cache without exposing it to another owner", async () => {
    const storage = createMemoryS3WorkspaceStorage();
    const cacheA = await mkdtemp(join(tmpdir(), "minder-s3-workspace-a-"));
    const cacheB = await mkdtemp(join(tmpdir(), "minder-s3-workspace-b-"));
    const first = createS3WorkspaceProvider({
      storage,
      cacheDirectory: cacheA,
    });
    const second = createS3WorkspaceProvider({
      storage,
      cacheDirectory: cacheB,
    });

    try {
      const writer = await first.resolve(
        "tenant-a-org-a-alice",
        "room:room-one:agent:writer",
      );
      await writeFile(join(writer.root, "report.md"), "private report", "utf8");
      await first.sync(writer);

      const reader = await second.resolve(
        "tenant-a-org-a-alice",
        "room:room-one:agent:reader",
      );
      await expect(
        readFile(join(reader.root, "report.md"), "utf8"),
      ).resolves.toBe("private report");

      const foreign = await second.resolve(
        "tenant-a-org-b-alice",
        "room:room-one:agent:reader",
      );
      await expect(access(join(foreign.root, "report.md"))).rejects.toThrow();
      expect(writer.root).not.toBe(process.cwd());
    } finally {
      await rm(cacheA, { recursive: true, force: true });
      await rm(cacheB, { recursive: true, force: true });
    }
  });

  it("reads a run session file through the workspace port with a size guard", async () => {
    const storage = createMemoryS3WorkspaceStorage();
    const cache = await mkdtemp(join(tmpdir(), "minder-s3-session-read-"));
    const provider = createS3WorkspaceProvider({
      storage,
      cacheDirectory: cache,
    });

    try {
      const workspace = await provider.resolve("owner", "chat:session");
      await writeFile(join(workspace.root, "report.txt"), "hello", "utf8");
      await provider.sync(workspace);

      await expect(
        provider.readSession("owner", "chat:session", "report.txt", 4),
      ).rejects.toThrow("file is too large");
      await expect(
        provider.readSession("owner", "chat:session", "report.txt", 10),
      ).resolves.toMatchObject({ fileName: "report.txt" });
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("rejects a run file beneath a symlinked parent outside the workspace", async () => {
    const cache = await mkdtemp(join(tmpdir(), "minder-s3-session-escape-"));
    const outside = await mkdtemp(join(tmpdir(), "minder-s3-outside-"));
    const provider = createS3WorkspaceProvider({
      storage: createMemoryS3WorkspaceStorage(),
      cacheDirectory: cache,
    });
    try {
      const workspace = await provider.resolve("owner", "chat:session");
      await writeFile(join(outside, "private.pdf"), "%PDF-private");
      await symlink(outside, join(workspace.root, "reports"), "dir");
      await expect(
        provider.readSession("owner", "chat:session", "reports/private.pdf"),
      ).rejects.toThrow("outside the workspace");
    } finally {
      await rm(cache, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("removes an object that was removed from the local workspace", async () => {
    const storage = createMemoryS3WorkspaceStorage();
    const cache = await mkdtemp(join(tmpdir(), "minder-s3-workspace-delete-"));
    const provider = createS3WorkspaceProvider({
      storage,
      cacheDirectory: cache,
    });

    try {
      const workspace = await provider.resolve(
        "owner",
        "room:room-one:agent:writer",
      );
      await writeFile(join(workspace.root, "draft.md"), "draft", "utf8");
      await provider.sync(workspace);
      await rm(join(workspace.root, "draft.md"));
      await provider.sync(workspace);

      const freshCache = await mkdtemp(
        join(tmpdir(), "minder-s3-workspace-empty-"),
      );
      try {
        const fresh = createS3WorkspaceProvider({
          storage,
          cacheDirectory: freshCache,
        });
        const restored = await fresh.resolve(
          "owner",
          "room:room-one:agent:reader",
        );
        await expect(access(join(restored.root, "draft.md"))).rejects.toThrow();
      } finally {
        await rm(freshCache, { recursive: true, force: true });
      }
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("refuses to construct a production workspace without MinIO configuration", async () => {
    await expect(createS3WorkspaceProviderFromEnvironment({})).rejects.toThrow(
      "MINIO_ENDPOINT",
    );
  });
});

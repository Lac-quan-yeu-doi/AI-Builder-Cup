import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfinedPath } from "@infrastructure/tools/core/index.js";

describe("resolveConfinedPath", () => {
  it("allows existing and missing paths inside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-tools-"));
    const realRoot = await realpath(root);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "index.ts"), "export {};");
    await expect(resolveConfinedPath(root, "src/index.ts")).resolves.toBe(
      join(realRoot, "src/index.ts"),
    );
    await expect(resolveConfinedPath(root, "src/new.ts")).resolves.toBe(
      join(realRoot, "src/new.ts"),
    );
  });

  it("rejects traversal and symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-tools-"));
    const outside = await mkdtemp(join(tmpdir(), "minder-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "escape"));
    await expect(resolveConfinedPath(root, "../secret.txt")).rejects.toThrow(
      "outside the workspace",
    );
    await expect(
      resolveConfinedPath(root, "escape/secret.txt"),
    ).rejects.toThrow("outside the workspace");
  });
});

import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GlobTool } from "@infrastructure/tools/core/index.js";
import type { ToolContext } from "@infrastructure/tools/core/index.js";

describe("GlobTool", () => {
  it("matches recursive extension patterns and sorts newest first", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-glob-"));
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await writeFile(join(root, "src", "old.ts"), "old");
    await writeFile(join(root, "src", "nested", "new.tsx"), "new");
    await utimes(join(root, "src", "old.ts"), new Date(1_000), new Date(1_000));
    await utimes(
      join(root, "src", "nested", "new.tsx"),
      new Date(2_000),
      new Date(2_000),
    );
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };

    const result = await new GlobTool().execute(
      { pattern: "**/*.{ts,tsx}" },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.output.split("\n").filter(Boolean)).toEqual([
      "src/nested/new.tsx",
      "src/old.ts",
    ]);
  });

  it("applies depth, ignore, and default exclusions", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-glob-"));
    await mkdir(join(root, "node_modules"), { recursive: true });
    await mkdir(join(root, "src", "deep"), { recursive: true });
    await writeFile(join(root, "node_modules", "hidden.ts"), "hidden");
    await writeFile(join(root, "src", "top.ts"), "top");
    await writeFile(join(root, "src", "deep", "deep.ts"), "deep");
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };

    const result = await new GlobTool().execute(
      { pattern: "**/*.ts", max_depth: 0, ignore: ["top.ts"] },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("No files found");
    expect(result.output).not.toContain("node_modules");
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GrepTool } from "@infrastructure/tools/core/index.js";
import type { ToolContext } from "@infrastructure/tools/core/index.js";

describe("GrepTool", () => {
  it("searches content with line numbers and filters by glob", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-grep-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "one.ts"), "Alpha\nbeta\nAlpha again\n");
    await writeFile(join(root, "src", "two.md"), "Alpha markdown\n");
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };

    const result = await new GrepTool().execute(
      { pattern: "alpha", path: "src", glob: "*.ts", "-i": true },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("one.ts:1:Alpha");
    expect(result.output).toContain("one.ts:3:Alpha again");
    expect(result.output).not.toContain("two.md");
  });

  it("skips explicitly ignored matching paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-grep-"));
    await writeFile(join(root, "keep.txt"), "needle\n");
    await writeFile(join(root, "ignored.txt"), "needle\n");
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };

    const result = await new GrepTool().execute(
      { pattern: "needle", ignore: ["ignored.txt"] },
      context,
    );

    expect(result.output).toContain("keep.txt");
    expect(result.output).not.toContain("ignored.txt");
  });

  it("supports literal, files, count, pagination, and confinement errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-grep-"));
    await writeFile(join(root, "one.txt"), "a+b\na+b\n");
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };
    const literal = await new GrepTool().execute(
      { pattern: "a+b", fixed_string: true, output_mode: "count" },
      context,
    );
    expect(literal.output).toContain("one.txt: 2");
    const files = await new GrepTool().execute(
      { pattern: "a+b", fixed_string: true, output_mode: "files_with_matches" },
      context,
    );
    expect(files.output).toBe("one.txt\n");
    const outside = await new GrepTool().execute(
      { pattern: "a", path: "../outside" },
      context,
    );
    expect(outside.success).toBe(false);
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ReadTool } from "@infrastructure/tools/core/index.js";
import type { ToolContext } from "@infrastructure/tools/core/index.js";

async function fixture(): Promise<{ root: string; context: ToolContext }> {
  const root = await mkdtemp(join(tmpdir(), "minder-read-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "example.ts"), "first\nsecond\nthird\n");
  await writeFile(join(root, "src", "binary.bin"), Buffer.from([0, 1, 2, 3]));
  return {
    root,
    context: {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    },
  };
}

describe("ReadTool", () => {
  it("formats bounded file lines and supports one-based offset", async () => {
    const { context } = await fixture();
    const result = await new ReadTool().execute(
      { file_path: "src/example.ts", offset: 2, limit: 1 },
      context,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe("     2\tsecond\n");
  });

  it("lists directories, skips binary content, and confines paths", async () => {
    const { root, context } = await fixture();
    const directory = await new ReadTool().execute(
      { file_path: "src" },
      context,
    );
    expect(directory.output).toContain("example.ts\n");
    expect(directory.output).toContain("binary.bin\n");
    const binary = await new ReadTool().execute(
      { file_path: "src/binary.bin" },
      context,
    );
    expect(binary.success).toBe(false);
    expect(binary.output).toContain("Binary");

    await writeFile(join(root, "src", "image.png"), "not really an image");
    await expect(
      new ReadTool().execute({ file_path: "src/image.png" }, context),
    ).resolves.toMatchObject({
      success: false,
      output: expect.stringContaining("Binary"),
    });
    const outside = await new ReadTool().execute(
      { file_path: "../outside.txt" },
      context,
    );
    expect(outside.success).toBe(false);
    expect(outside.output).toContain("outside the workspace");
    expect(root).toBeTruthy();
  });
});

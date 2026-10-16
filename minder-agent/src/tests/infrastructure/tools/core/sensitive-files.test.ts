import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  GlobTool,
  isSensitiveWorkspacePath,
  ReadTool,
  type ToolContext,
  WriteTool,
} from "@infrastructure/tools/core/index.js";

async function fixture(): Promise<ToolContext> {
  const root = await mkdtemp(join(tmpdir(), "minder-sensitive-"));
  return {
    workspaceRoot: root,
    workingDirectory: root,
    signal: new AbortController().signal,
  };
}

describe("sensitive workspace files", () => {
  it("identifies credential files while permitting documentation templates", () => {
    expect(isSensitiveWorkspacePath("config/.env.production")).toBe(true);
    expect(isSensitiveWorkspacePath("credentials.json")).toBe(true);
    expect(isSensitiveWorkspacePath("keys/id_ed25519")).toBe(true);
    expect(isSensitiveWorkspacePath(".env.example")).toBe(false);
    expect(isSensitiveWorkspacePath("src/index.ts")).toBe(false);
  });

  it("denies direct reads and writes, and does not disclose sensitive files through glob", async () => {
    const context = await fixture();
    await writeFile(join(context.workspaceRoot, ".env"), "TOKEN=secret\n");
    await writeFile(join(context.workspaceRoot, ".env.example"), "TOKEN=\n");

    await expect(
      new ReadTool().execute({ file_path: ".env" }, context),
    ).resolves.toMatchObject({
      success: false,
      output: expect.stringContaining("sensitive"),
    });
    await expect(
      new WriteTool().execute(
        { file_path: "credentials.json", content: "{}" },
        context,
      ),
    ).resolves.toMatchObject({
      success: false,
      output: expect.stringContaining("sensitive"),
    });
    await expect(
      new GlobTool().execute({ pattern: "**/*" }, context),
    ).resolves.toMatchObject({
      success: true,
      output: expect.not.stringContaining(".env\n"),
    });
    await expect(
      new ReadTool().execute({ file_path: ".env.example" }, context),
    ).resolves.toMatchObject({ success: true });
  });
});

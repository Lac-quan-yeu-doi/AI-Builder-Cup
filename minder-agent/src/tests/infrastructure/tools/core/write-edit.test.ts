import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  EditTool,
  FileMutationQueue,
  MultiEditTool,
  WriteTool,
  type ToolContext,
} from "@infrastructure/tools/core/index.js";

async function fixture(): Promise<{ root: string; context: ToolContext }> {
  const root = await mkdtemp(join(tmpdir(), "minder-write-edit-"));
  return {
    root,
    context: {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    },
  };
}

describe("coding file tools", () => {
  it("writes a new confined file and rejects a workspace escape", async () => {
    const { root, context } = await fixture();
    const tool = new WriteTool();

    await expect(
      tool.execute(
        { file_path: "src/new.ts", content: "export const value = 1;\n" },
        context,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(readFile(join(root, "src", "new.ts"), "utf8")).resolves.toBe(
      "export const value = 1;\n",
    );
    await expect(
      tool.execute({ file_path: "../outside.ts", content: "no" }, context),
    ).resolves.toMatchObject({
      success: false,
      output: expect.stringContaining("outside the workspace"),
    });
  });

  it("records a safe diagnostic after a workspace mutation", async () => {
    const { context } = await fixture();
    const diagnostics: Array<{ name: string; data: unknown }> = [];
    const result = await new WriteTool().execute(
      { file_path: "report.md", content: "report" },
      {
        ...context,
        diagnostics: {
          record: async (name, data) => void diagnostics.push({ name, data }),
        },
      },
    );

    expect(result.success).toBe(true);
    expect(diagnostics).toEqual([
      { name: "workspace_file_written", data: { path: "report.md", bytes: 6 } },
    ]);
  });

  it("serializes mutations submitted for the same file", async () => {
    const queue = new FileMutationQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    let signalStarted!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    const first = queue.run("/workspace/file.ts", async () => {
      order.push("first:start");
      signalStarted();
      await firstBlocked;
      order.push("first:end");
    });
    const second = queue.run("/workspace/file.ts", async () => {
      order.push("second");
    });
    await started;
    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("edits exactly while preserving a BOM and original line ending", async () => {
    const { root, context } = await fixture();
    const path = join(root, "example.txt");
    await writeFile(path, "\uFEFFfirst\r\nsecond\r\n");

    const result = await new EditTool().execute(
      { file_path: "example.txt", old_text: "first", new_text: "changed" },
      context,
    );

    expect(result).toMatchObject({ success: true });
    await expect(readFile(path, "utf8")).resolves.toBe(
      "\uFEFFchanged\r\nsecond\r\n",
    );
  });

  it("accepts Rust-compatible edit arguments and tolerates indentation-only drift", async () => {
    const { root, context } = await fixture();
    const path = join(root, "example.ts");
    await writeFile(path, "function demo() {\n    return true;\n}\n");

    const result = await new EditTool().execute(
      {
        file_path: "example.ts",
        old_string: "function demo() {\n  return true;\n}",
        new_string: "function demo() {\n  return false;\n}",
      },
      context,
    );

    expect(result).toMatchObject({
      success: true,
      metadata: { match_pass: "line_trimmed" },
    });
    await expect(readFile(path, "utf8")).resolves.toBe(
      "function demo() {\n  return false;\n}\n",
    );
  });

  it("leaves a file unchanged when one MultiEdit replacement cannot be applied", async () => {
    const { root, context } = await fixture();
    const path = join(root, "example.txt");
    await writeFile(path, "alpha\nbeta\n");

    const result = await new MultiEditTool().execute(
      {
        file_path: "example.txt",
        edits: [
          { old_text: "alpha", new_text: "ALPHA" },
          { old_text: "missing", new_text: "MISSING" },
        ],
      },
      context,
    );

    expect(result).toMatchObject({
      success: false,
      output: expect.stringContaining("Could not find"),
    });
    await expect(readFile(path, "utf8")).resolves.toBe("alpha\nbeta\n");
  });
});

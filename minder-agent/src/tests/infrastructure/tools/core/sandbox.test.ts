import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  BashTool,
  sandboxAllowsCommand,
  type ToolContext,
  WriteTool,
} from "@infrastructure/tools/core/index.js";

const runInWorkspaceSandbox = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    output: "",
    metadata: { exit_code: 0 },
  })),
);

vi.mock("@infrastructure/tools/core/sandbox-runner-client.js", () => ({
  runInWorkspaceSandbox,
}));

describe("tool sandbox policy", () => {
  it("restricts writes to configured relative workspace paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-sandbox-"));
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
      sandbox: {
        enabled: true,
        allowedCommands: ["pwd"],
        writablePaths: ["generated"],
      },
    };

    await expect(
      new WriteTool().execute(
        { file_path: "blocked/report.md", content: "no" },
        context,
      ),
    ).resolves.toMatchObject({
      success: false,
      output: expect.stringContaining("Sandbox"),
    });
    await expect(
      new WriteTool().execute(
        { file_path: "generated/report.md", content: "yes" },
        context,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      readFile(join(root, "generated", "report.md"), "utf8"),
    ).resolves.toBe("yes");
  });

  it("runs arbitrary commands inside the OS sandbox runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-sandbox-"));
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
      sandbox: {
        enabled: true,
        allowedCommands: ["pwd"],
        writablePaths: ["."],
      },
    };

    await expect(
      new BashTool().execute({ command: "git status" }, context),
    ).resolves.toMatchObject({ success: true });
    expect(runInWorkspaceSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ command: "git status" }),
    );
  });

  it("checks every chained segment and rejects command substitution", () => {
    const sandbox = {
      enabled: true,
      allowedCommands: ["pwd", "echo"],
      writablePaths: ["."],
    } as const;

    expect(sandboxAllowsCommand(sandbox, "pwd && rm -rf /")).toBe(false);
    expect(sandboxAllowsCommand(sandbox, "echo $(rm -rf /)")).toBe(false);
    expect(sandboxAllowsCommand(sandbox, "pwd | cat")).toBe(false);
    expect(sandboxAllowsCommand(sandbox, "pwd && echo ready")).toBe(true);
    expect(sandboxAllowsCommand(sandbox, "pwd")).toBe(true);
  });
});

import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BashTool } from "@infrastructure/tools/core/index.js";
import type { ToolContext } from "@infrastructure/tools/core/index.js";

const runInWorkspaceSandbox = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    output: "file.txt",
    metadata: { exit_code: 0 },
  })),
);

vi.mock("@infrastructure/tools/core/sandbox-runner-client.js", () => ({
  runInWorkspaceSandbox,
}));

describe("BashTool", () => {
  it("delegates Bash and Python commands to the shared workspace runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-bash-"));
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };
    const result = await new BashTool().execute(
      { command: "python3 -c 'print(1 + 1)'" },
      context,
    );
    expect(result).toMatchObject({ success: true });
    expect(new BashTool()).toMatchObject({
      readOnly: false,
      destructive: true,
    });
    expect(new BashTool().parameters.properties).not.toHaveProperty("timeout");
    expect(runInWorkspaceSandbox).toHaveBeenCalledWith({
      command: "python3 -c 'print(1 + 1)'",
      workspaceRoot: root,
      workingDirectory: await realpath(root),
      signal: context.signal,
    });
  });

  it("reports a safe progress update for a command execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-bash-"));
    const messages: string[] = [];
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
      progress: { report: async (message) => void messages.push(message) },
    };

    await expect(
      new BashTool().execute({ command: "pwd" }, context),
    ).resolves.toMatchObject({
      success: true,
    });
    expect(messages).toEqual(["Running command in workspace sandbox"]);
  });

  it("rejects invalid commands and escaped workdirs", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-bash-"));
    const context: ToolContext = {
      workspaceRoot: root,
      workingDirectory: root,
      signal: new AbortController().signal,
    };
    for (const args of [
      { command: "" },
      { command: "pwd", workdir: "../outside" },
    ]) {
      await expect(
        new BashTool().execute(args, context),
      ).resolves.toMatchObject({ success: false });
    }
  });
});

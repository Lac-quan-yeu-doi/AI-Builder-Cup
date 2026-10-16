import type { JsonObject } from "@domain/shared";
import { resolveConfinedPath } from "./paths.js";
import { truncateOutput } from "./truncate.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { runInWorkspaceSandbox } from "./sandbox-runner-client.js";

export class BashTool implements MinderTool {
  readonly name = "Bash";
  readonly description =
    "Run shell commands in the current room workspace with full workspace read/write access and the installed offline tools. Commands have no automatic time limit and stop when cancelled. The host and network remain isolated.";
  readonly category = "process" as const;
  readonly readOnly = false;
  readonly destructive = true;
  readonly aliases = ["run_command"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      command: { type: "string" },
      workdir: { type: "string" },
    },
    required: ["command"],
  };

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command.trim()) return failure("command is required.");
    if (context.signal.aborted) return failure("Command was interrupted.");

    let workingDirectory: string;
    try {
      workingDirectory = await resolveConfinedPath(
        context.workspaceRoot,
        typeof args.workdir === "string"
          ? args.workdir
          : context.workingDirectory,
      );
    } catch (error) {
      return failure(
        error instanceof Error
          ? error.message
          : "Command path is outside the workspace.",
      );
    }

    await context.progress?.report("Running command in workspace sandbox");
    try {
      return await runInWorkspaceSandbox({
        command,
        workspaceRoot: context.workspaceRoot,
        workingDirectory,
        signal: context.signal,
      });
    } catch (error) {
      return failure(
        error instanceof Error ? error.message : "Sandbox execution failed.",
      );
    }
  }
}

function failure(output: string): ToolResult {
  return { success: false, output: truncateOutput(output), metadata: {} };
}

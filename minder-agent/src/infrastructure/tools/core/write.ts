import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JsonObject } from "@domain/shared";
import { FileMutationQueue } from "./file-mutation-queue.js";
import { resolveConfinedPath } from "./paths.js";
import {
  isSensitiveWorkspacePath,
  SENSITIVE_FILE_DENIAL,
} from "./sensitive-files.js";
import { sandboxAllowsWritablePath, SANDBOX_WRITE_DENIAL } from "./sandbox.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { recordFileAccess } from "./file-access.js";
import { toolFailure as failure } from "./tool-result.js";

const queue = new FileMutationQueue();

export class WriteTool implements MinderTool {
  readonly name = "Write";
  readonly description = "Create or replace a text file inside the workspace.";
  readonly category = "write" as const;
  readonly readOnly = false;
  readonly destructive = true;
  readonly aliases = ["write_file"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Workspace-relative file path.",
      },
      content: { type: "string", description: "Complete replacement text." },
    },
    required: ["file_path", "content"],
    additionalProperties: false,
  };

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const requested = typeof args.file_path === "string" ? args.file_path : "";
    const content = typeof args.content === "string" ? args.content : undefined;
    if (!requested) return failure("file_path is required.");
    if (isSensitiveWorkspacePath(requested))
      return failure(SENSITIVE_FILE_DENIAL);
    if (content === undefined) return failure("content is required.");
    if (context.signal.aborted) return failure("Write was interrupted.");
    try {
      const path = await resolveConfinedPath(context.workspaceRoot, requested);
      if (
        !sandboxAllowsWritablePath(context.sandbox, context.workspaceRoot, path)
      )
        return failure(SANDBOX_WRITE_DENIAL);
      return queue.run(path, async () => {
        if (context.signal.aborted) return failure("Write was interrupted.");
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf8");
        await recordFileAccess(
          context.fileAccess,
          context.runId,
          requested,
          "write",
        );
        const bytes = Buffer.byteLength(content, "utf8");
        await context.diagnostics?.record("workspace_file_written", {
          path: requested,
          bytes,
        });
        return {
          success: true,
          output: `Wrote ${requested}.`,
          metadata: {
            path: requested,
            bytes,
          },
        };
      });
    } catch (error) {
      return failure(
        error instanceof Error ? error.message : "Unable to write file.",
      );
    }
  }
}

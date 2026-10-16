import { readdir, stat } from "node:fs/promises";
import type { JsonObject } from "@domain/shared";
import { resolveConfinedPath } from "./paths.js";
import {
  isSensitiveWorkspacePath,
  SENSITIVE_FILE_DENIAL,
} from "./sensitive-files.js";
import { truncateOutput } from "./truncate.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { recordFileAccess } from "./file-access.js";
import { isBinaryFile } from "./binary.js";
import { toolFailure as failure } from "./tool-result.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LINE_LENGTH = 2_000;
const MAX_LINES = 2_000;

export class ReadTool implements MinderTool {
  readonly name = "Read";
  readonly description =
    "Read a text file or list a directory inside the workspace.";
  readonly category = "read" as const;
  readonly readOnly = true;
  readonly destructive = false;
  readonly aliases = ["read_file"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      file_path: { type: "string", description: "File or directory path." },
      offset: { type: "number", description: "One-based line offset." },
      limit: { type: "number", description: "Maximum number of lines." },
    },
    required: ["file_path"],
  };

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const requested = typeof args.file_path === "string" ? args.file_path : "";
    if (!requested) return failure("file_path is required.");
    if (isSensitiveWorkspacePath(requested))
      return failure(SENSITIVE_FILE_DENIAL);
    try {
      const path = await resolveConfinedPath(context.workspaceRoot, requested);
      const metadata = await stat(path);
      if (metadata.isDirectory()) return this.readDirectory(path);
      if (!metadata.isFile()) return failure("Path is not a regular file.");
      if (metadata.size > MAX_FILE_BYTES)
        return failure("File is larger than the 10 MiB read limit.");
      const content = await readText(path);
      if (content === undefined)
        return failure("Binary files cannot be read as text.");
      const offset = positiveInteger(args.offset, 1);
      const limit = positiveInteger(args.limit, MAX_LINES);
      const lines = content
        .split(/\r?\n/)
        .slice(offset - 1, offset - 1 + Math.min(limit, MAX_LINES));
      const output = lines
        .map((line, index) => {
          const bounded =
            line.length > MAX_LINE_LENGTH
              ? line.slice(0, MAX_LINE_LENGTH) + "…"
              : line;
          return `${String(offset + index).padStart(6, " ")}\t${bounded}\n`;
        })
        .join("");
      await recordFileAccess(
        context.fileAccess,
        context.runId,
        requested,
        "read",
      );
      return ok(truncateOutput(output, 50_000));
    } catch (error) {
      return failure(
        error instanceof Error ? error.message : "Unable to read path.",
      );
    }
  }

  private async readDirectory(path: string): Promise<ToolResult> {
    const entries = await readdir(path, { withFileTypes: true });
    const output = entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}\n`)
      .join("");
    return ok(truncateOutput(output, 50_000));
  }
}

async function readText(path: string): Promise<string | undefined> {
  const buffer = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path),
  );
  if (isBinaryFile(path, buffer)) return undefined;
  return buffer.toString("utf8");
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : fallback;
}

function ok(output: string): ToolResult {
  return { success: true, output, metadata: {} };
}

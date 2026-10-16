import type { JsonObject } from "@domain/shared";
import { resolveSearchRoot, globMatches, walkFiles } from "./walk.js";
import { isSensitiveWorkspacePath } from "./sensitive-files.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { toolFailure as failure } from "./tool-result.js";

const MAX_RESULTS = 500;

export class GlobTool implements MinderTool {
  readonly name = "Glob";
  readonly description = "List files matching a glob pattern, newest first.";
  readonly category = "read" as const;
  readonly readOnly = true;
  readonly destructive = false;
  readonly aliases = ["list_files"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern relative to path.",
      },
      path: { type: "string", description: "Base directory." },
      max_depth: { type: "number", description: "Maximum directory depth." },
      ignore: { type: "array", items: { type: "string" } },
    },
    required: ["pattern"],
  };

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    if (!pattern) return failure("pattern is required.");
    try {
      const base = await resolveSearchRoot(
        context.workspaceRoot,
        typeof args.path === "string" ? args.path : undefined,
      );
      const files = await walkFiles(base, base);
      const maxDepth =
        typeof args.max_depth === "number" &&
        Number.isInteger(args.max_depth) &&
        args.max_depth >= 0
          ? args.max_depth
          : undefined;
      const ignores = Array.isArray(args.ignore)
        ? args.ignore.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const matching = files
        .filter((file) => !isSensitiveWorkspacePath(file.relativePath))
        .filter((file) => globMatches(pattern, file.relativePath))
        .filter(
          (file) =>
            maxDepth === undefined ||
            file.relativePath.split("/").length - 1 <= maxDepth,
        )
        .filter(
          (file) =>
            !ignores.some((ignore) => ignored(ignore, file.relativePath)),
        )
        .sort(
          (left, right) =>
            right.mtimeMs - left.mtimeMs ||
            left.relativePath.localeCompare(right.relativePath),
        );
      const total = matching.length;
      const shown = matching.slice(0, MAX_RESULTS);
      if (shown.length === 0) {
        const hint =
          pattern.endsWith("**") && !pattern.endsWith("**/*")
            ? " Hint: use **/* to match files."
            : "";
        return ok(`No files found matching '${pattern}'${hint}`, {
          total_files: 0,
          truncated: false,
        });
      }
      let output = shown.map((file) => `${file.relativePath}\n`).join("");
      const truncated = total > MAX_RESULTS;
      if (truncated)
        output += `\n... and ${total - MAX_RESULTS} more files (showing first ${MAX_RESULTS})\n`;
      return ok(output, { total_files: total, truncated });
    } catch (error) {
      return failure(
        error instanceof Error ? error.message : "Glob search failed.",
      );
    }
  }
}

function ignored(pattern: string, path: string): boolean {
  if (pattern.endsWith("/"))
    return path === pattern.slice(0, -1) || path.startsWith(pattern);
  return globMatches(pattern, path) || path.split("/").includes(pattern);
}

function ok(
  output: string,
  metadata: Record<string, string | number | boolean>,
): ToolResult {
  return { success: true, output, metadata };
}

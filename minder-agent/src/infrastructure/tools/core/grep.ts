import { readFile } from "node:fs/promises";
import type { JsonObject } from "@domain/shared";
import { resolveSearchRoot, globMatches, walkFiles } from "./walk.js";
import { isSensitiveWorkspacePath } from "./sensitive-files.js";
import { isBinaryFile } from "./binary.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { toolFailure as failure } from "./tool-result.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class GrepTool implements MinderTool {
  readonly name = "Grep";
  readonly description =
    "Search text files with regex or fixed-string matching.";
  readonly category = "read" as const;
  readonly readOnly = true;
  readonly destructive = false;
  readonly aliases = ["search_files"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      glob: { type: "string" },
      include: { type: "string" },
      ignore: { type: "array", items: { type: "string" } },
      "-i": { type: "boolean" },
      fixed_string: { type: "boolean" },
      output_mode: {
        type: "string",
        enum: ["content", "files_with_matches", "count"],
      },
      "-n": { type: "boolean" },
      head_limit: { type: "number" },
      offset: { type: "number" },
    },
    required: ["pattern"],
  };

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    if (!pattern) return failure("pattern is required and cannot be empty.");
    try {
      const base = await resolveSearchRoot(
        context.workspaceRoot,
        typeof args.path === "string" ? args.path : undefined,
      );
      const files = await walkFiles(base, base);
      const include =
        typeof args.glob === "string"
          ? args.glob
          : typeof args.include === "string"
            ? args.include
            : undefined;
      const candidates = include
        ? files.filter((file) => globMatches(include, file.relativePath))
        : files;
      const ignores = Array.isArray(args.ignore)
        ? args.ignore.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const fixed = args.fixed_string === true;
      const insensitive = args["-i"] === true;
      const regex = compile(pattern, fixed, insensitive);
      const entries: string[] = [];
      for (const file of candidates.sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      )) {
        if (isSensitiveWorkspacePath(file.relativePath)) continue;
        if (ignores.some((ignore) => ignored(ignore, file.relativePath)))
          continue;
        if (file.size > MAX_FILE_BYTES) continue;
        const buffer = await readFile(file.absolutePath);
        if (isBinaryFile(file.absolutePath, buffer)) continue;
        const lines = buffer.toString("utf8").split(/\r?\n/);
        const matches = lines.flatMap((line, index) =>
          regex.test(line) ? [{ line, number: index + 1 }] : [],
        );
        if (matches.length === 0) continue;
        const mode =
          args.output_mode === "files_with_matches" ||
          args.output_mode === "count"
            ? args.output_mode
            : "content";
        if (mode === "files_with_matches") entries.push(file.relativePath);
        else if (mode === "count")
          entries.push(`${file.relativePath}: ${matches.length}`);
        else {
          const showNumbers = args["-n"] !== false;
          entries.push(
            ...matches.map((match) =>
              showNumbers
                ? `${file.relativePath}:${match.number}:${match.line}`
                : `${file.relativePath}:${match.line}`,
            ),
          );
        }
      }
      const offset = nonNegativeInteger(args.offset, 0);
      const head = nonNegativeInteger(args.head_limit, 0);
      const paged =
        head === 0
          ? entries.slice(offset)
          : entries.slice(offset, offset + head);
      return {
        success: true,
        output:
          paged.length > 0 ? paged.join("\n") + "\n" : "No matches found.\n",
        metadata: { total_matches: entries.length },
      };
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Search failed.");
    }
  }
}

function ignored(pattern: string, path: string): boolean {
  if (pattern.endsWith("/"))
    return path === pattern.slice(0, -1) || path.startsWith(pattern);
  return globMatches(pattern, path) || path.split("/").includes(pattern);
}

function compile(
  pattern: string,
  fixed: boolean,
  insensitive: boolean,
): RegExp {
  const source = fixed ? escapeRegex(pattern) : pattern;
  try {
    return new RegExp(source, insensitive ? "i" : "");
  } catch {
    return new RegExp(escapeRegex(pattern), insensitive ? "i" : "");
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

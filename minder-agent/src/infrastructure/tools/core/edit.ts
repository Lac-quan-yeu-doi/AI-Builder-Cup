import { readFile, writeFile } from "node:fs/promises";
import type { JsonObject, JsonValue } from "@domain/shared";
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

interface Edit {
  readonly oldText: string;
  readonly newText: string;
  readonly replaceAll?: boolean;
}

interface AppliedEdits {
  readonly content: string;
  readonly replacements: number;
  readonly matchPasses: readonly string[];
}

const queue = new FileMutationQueue();

abstract class BaseEditTool implements MinderTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: JsonObject;
  readonly category = "write" as const;
  readonly readOnly = false;
  readonly destructive = true;

  async execute(args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const requested = typeof args.file_path === "string" ? args.file_path : "";
    if (!requested) return failure("file_path is required.");
    if (isSensitiveWorkspacePath(requested))
      return failure(SENSITIVE_FILE_DENIAL);
    const edits = this.parseEdits(args);
    if (edits instanceof Error) return failure(edits.message);
    if (context.signal.aborted) return failure("Edit was interrupted.");
    try {
      const path = await resolveConfinedPath(context.workspaceRoot, requested);
      if (
        !sandboxAllowsWritablePath(context.sandbox, context.workspaceRoot, path)
      )
        return failure(SANDBOX_WRITE_DENIAL);
      return await queue.run(path, async () => {
        if (context.signal.aborted) return failure("Edit was interrupted.");
        const raw = await readFile(path, "utf8");
        const hasBom = raw.startsWith("\uFEFF");
        const original = hasBom ? raw.slice(1) : raw;
        const ending = original.includes("\r\n") ? "\r\n" : "\n";
        const normalized = normalizeToLf(original);
        const applied = applyEdits(normalized, edits, requested);
        await writeFile(
          path,
          `${hasBom ? "\uFEFF" : ""}${restoreLineEndings(applied.content, ending)}`,
          "utf8",
        );
        await recordFileAccess(
          context.fileAccess,
          context.runId,
          requested,
          "write",
        );
        await context.diagnostics?.record("workspace_file_edited", {
          path: requested,
          replacements: applied.replacements,
        });
        return {
          success: true,
          output: `Updated ${requested}.`,
          metadata: {
            path: requested,
            edits: edits.length,
            replacements: applied.replacements,
            ...(applied.matchPasses.some((pass) => pass !== "exact")
              ? {
                  match_pass: applied.matchPasses.find(
                    (pass) => pass !== "exact",
                  )!,
                }
              : {}),
          },
        };
      });
    } catch (error) {
      return failure(
        error instanceof Error ? error.message : "Unable to edit file.",
      );
    }
  }

  protected abstract parseEdits(args: JsonObject): readonly Edit[] | Error;
}

export class EditTool extends BaseEditTool {
  readonly name = "Edit";
  readonly description =
    "Replace one unique exact text block in a workspace file.";
  readonly aliases = ["edit_file"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      file_path: { type: "string" },
      old_text: { type: "string" },
      new_text: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" },
    },
    required: ["file_path"],
    additionalProperties: false,
  };

  protected parseEdits(args: JsonObject): readonly Edit[] | Error {
    if (
      (typeof args.old_text !== "string" &&
        typeof args.old_string !== "string") ||
      (typeof args.new_text !== "string" && typeof args.new_string !== "string")
    ) {
      return new Error(
        "old_text/new_text or old_string/new_string are required.",
      );
    }
    return [
      {
        oldText: (args.old_text ?? args.old_string) as string,
        newText: (args.new_text ?? args.new_string) as string,
        ...(args.replace_all === true ? { replaceAll: true } : {}),
      },
    ];
  }
}

export class MultiEditTool extends BaseEditTool {
  readonly name = "MultiEdit";
  readonly description =
    "Apply multiple unique, non-overlapping exact replacements atomically.";
  readonly aliases = ["multi_edit"] as const;
  readonly parameters: JsonObject = {
    type: "object",
    properties: {
      file_path: { type: "string" },
      edits: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            old_text: { type: "string" },
            new_text: { type: "string" },
          },
          required: ["old_text", "new_text"],
          additionalProperties: false,
        },
      },
    },
    required: ["file_path", "edits"],
    additionalProperties: false,
  };

  protected parseEdits(args: JsonObject): readonly Edit[] | Error {
    if (!Array.isArray(args.edits) || args.edits.length === 0)
      return new Error("edits must contain at least one replacement.");
    const edits: Edit[] = [];
    for (const value of args.edits as JsonValue[]) {
      if (
        !isRecord(value) ||
        typeof value.old_text !== "string" ||
        typeof value.new_text !== "string"
      ) {
        return new Error("Each edit requires old_text and new_text.");
      }
      edits.push({ oldText: value.old_text, newText: value.new_text });
    }
    return edits;
  }
}

function applyEdits(
  content: string,
  edits: readonly Edit[],
  path: string,
): AppliedEdits {
  const matches = edits
    .map((edit, index) => {
      const oldText = normalizeToLf(edit.oldText);
      if (!oldText)
        throw new Error(
          `edits[${index}].old_text must not be empty in ${path}.`,
        );
      const located = findEditMatch(content, oldText);
      if (located === undefined)
        throw new Error(
          `Could not find edits[${index}] in ${path}. The old text did not match after compatible whitespace and escape normalization.`,
        );
      const positions = occurrencePositions(content, located.actual);
      if (positions.length > 1 && !edit.replaceAll)
        throw new Error(
          `Found multiple occurrences of edits[${index}] in ${path}. Provide more context.`,
        );
      return positions
        .slice(0, edit.replaceAll ? undefined : 1)
        .map((start) => ({
          index,
          start,
          length: located.actual.length,
          replacement: normalizeToLf(edit.newText),
          matchPass: located.pass,
        }));
    })
    .flat()
    .sort((left, right) => left.start - right.start);
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1]!;
    const current = matches[index]!;
    if (previous.start + previous.length > current.start)
      throw new Error(
        `edits[${previous.index}] and edits[${current.index}] overlap in ${path}.`,
      );
  }
  let result = content;
  for (const match of matches.reverse())
    result =
      result.slice(0, match.start) +
      match.replacement +
      result.slice(match.start + match.length);
  if (result === content) throw new Error(`No changes made to ${path}.`);
  return {
    content: result,
    replacements: matches.length,
    matchPasses: matches.map((match) => match.matchPass),
  };
}

function findEditMatch(
  content: string,
  requested: string,
):
  | {
      readonly actual: string;
      readonly pass:
        | "exact"
        | "line_trimmed"
        | "whitespace_normalized"
        | "escape_normalized";
    }
  | undefined {
  if (content.includes(requested)) return { actual: requested, pass: "exact" };
  const trimmed = findLines(content, requested, (line) => line.trim());
  if (trimmed !== undefined) return { actual: trimmed, pass: "line_trimmed" };
  const whitespace = findLines(content, requested, (line) =>
    line.replace(/\s+/g, " ").trim(),
  );
  if (whitespace !== undefined)
    return { actual: whitespace, pass: "whitespace_normalized" };
  const unescaped = requested
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
  return unescaped !== requested && content.includes(unescaped)
    ? { actual: unescaped, pass: "escape_normalized" }
    : undefined;
}

function findLines(
  content: string,
  requested: string,
  normalize: (line: string) => string,
): string | undefined {
  const wanted = requested.split("\n");
  const lines = content.split("\n");
  if (wanted.length > lines.length) return undefined;
  for (let start = 0; start <= lines.length - wanted.length; start += 1) {
    const candidate = lines.slice(start, start + wanted.length);
    if (
      candidate.every(
        (line, index) => normalize(line) === normalize(wanted[index]!),
      )
    )
      return candidate.join("\n");
  }
  return undefined;
}

function occurrencePositions(content: string, text: string): readonly number[] {
  const positions: number[] = [];
  for (
    let start = content.indexOf(text);
    start >= 0;
    start = content.indexOf(text, start + text.length)
  )
    positions.push(start);
  return positions;
}

function normalizeToLf(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(value: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? value.replace(/\n/g, "\r\n") : value;
}

function isRecord(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

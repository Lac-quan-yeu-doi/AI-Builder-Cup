import type { JsonObject } from "@domain/shared";
import type { RuntimeToolResult } from "@application/shared/ports/index.js";

/**
 * Derive a conservative workspace invalidation from a completed tool action.
 * A tool may expose a path in its arguments or metadata. We deliberately mark
 * writes as `modified`: determining whether a file existed first would require
 * an extra workspace read and can race with concurrent writers.
 */
export function workspaceChangesForToolResult(input: {
  readonly name: string;
  readonly arguments: JsonObject;
  readonly result: RuntimeToolResult;
  readonly readOnly: boolean;
  readonly destructive: boolean;
}): readonly {
  readonly rel_path: string;
  readonly kind: "modified" | "deleted";
}[] {
  if (!input.result.success || input.readOnly) return [];
  const path = workspacePath(input.arguments, input.result.metadata);
  if (path === undefined) return [];
  const kind = /(?:delete|remove|unlink)/iu.test(input.name)
    ? "deleted"
    : "modified";
  return [{ rel_path: path, kind }];
}

function workspacePath(
  arguments_: JsonObject,
  metadata: Record<string, unknown>,
): string | undefined {
  for (const value of [arguments_.file_path, arguments_.path, metadata.path]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

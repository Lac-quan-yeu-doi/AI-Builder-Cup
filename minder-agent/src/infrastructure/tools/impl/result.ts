import type { JsonObject } from "@domain/index.js";
import type { ToolResult } from "@application/shared/ports/index.js";

export const DEFAULT_TOOL_OUTPUT_LIMIT = 10_000;

export interface ExecutorResult {
  readonly success: boolean;
  readonly content: string;
  readonly metadata: JsonObject;
}

/**
 * Bound a tool result's output to `limit` bytes. Content beyond the limit is
 * moved into `overflow` so callers can decide whether to surface a handle rather
 * than an unbounded body.
 */
export function boundToolResult(
  result: ExecutorResult,
  limit = DEFAULT_TOOL_OUTPUT_LIMIT,
): ToolResult {
  if (result.content.length <= limit) {
    return {
      success: result.success,
      content: result.content,
      metadata: result.metadata,
    };
  }
  return {
    success: result.success,
    content: result.content.slice(0, limit),
    metadata: result.metadata,
    overflow: result.content.slice(limit),
  };
}

/** Build a structured failure result with a stable machine-readable code. */
export function failureResult(
  code: string,
  message: string,
  metadata: JsonObject = {},
): ToolResult {
  return {
    success: false,
    content: message,
    metadata: { ...metadata, code },
  };
}

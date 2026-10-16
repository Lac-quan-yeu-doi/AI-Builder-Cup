import type { ToolResult } from "./types.js";

export function toolFailure(output: string): ToolResult {
  return { success: false, output, metadata: {} };
}

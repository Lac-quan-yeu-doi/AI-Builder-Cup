import type { JsonObject } from "@domain/index.js";
import type { ToolResult } from "./tools.js";
export interface McpServerRef {
  readonly name: string;
}
export interface McpDataScope {
  readonly values: readonly string[];
}
export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}
export interface McpToolCall {
  readonly server: McpServerRef;
  readonly name: string;
  readonly arguments: JsonObject;
}
export interface McpInvocationContext {
  readonly signal: AbortSignal;
  readonly scope: McpDataScope;
}
export interface McpPort {
  discover(
    server: McpServerRef,
    scope: McpDataScope,
  ): Promise<readonly McpToolDescriptor[]>;
  call(input: McpToolCall, context: McpInvocationContext): Promise<ToolResult>;
}

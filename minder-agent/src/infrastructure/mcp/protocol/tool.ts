import type { JsonObject } from "@domain/index.js";
import type {
  MinderTool,
  ToolContext,
  ToolResult,
} from "@infrastructure/tools/core";
import type { McpManagerCallContext, McpManagerTarget } from "./manager.js";
export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
  };
}

export function createManagedMcpTool(input: {
  readonly target: McpManagerTarget;
  readonly descriptor: McpToolDescriptor;
  readonly call: (
    name: string,
    arguments_: JsonObject,
    signal: AbortSignal,
    context?: McpManagerCallContext,
  ) => Promise<
    | {
        readonly success: true;
        readonly content: string;
        readonly metadata: JsonObject;
      }
    | {
        readonly success: false;
        readonly message: string;
        readonly code: string;
      }
  >;
}): MinderTool {
  return {
    name: input.descriptor.name,
    description: input.descriptor.description,
    parameters: input.descriptor.inputSchema,
    category: "mcp",
    readOnly: input.descriptor.annotations?.readOnlyHint === true,
    async execute(arguments_, context: ToolContext): Promise<ToolResult> {
      try {
        const result = await input.call(
          input.descriptor.name,
          arguments_,
          context.signal,
          {
            ...(context.runId === undefined ? {} : { runId: context.runId }),
            ...(context.authorizationRunId === undefined
              ? {}
              : { authorizationRunId: context.authorizationRunId }),
            ...(context.automationRunId === undefined
              ? {}
              : { automationRunId: context.automationRunId }),
            ...(context.automationOrganizationId === undefined
              ? {}
              : { automationOrganizationId: context.automationOrganizationId }),
            ...(context.roomId === undefined ? {} : { roomId: context.roomId }),
            ...(context.callerSubject === undefined
              ? {}
              : { callerSubject: context.callerSubject }),
            ...(context.automationRunId === undefined
              ? {}
              : { automationRunId: context.automationRunId }),
            ...(context.automationOrganizationId === undefined
              ? {}
              : { automationOrganizationId: context.automationOrganizationId }),
          },
        );
        if (!result.success)
          return { success: false, output: result.message, metadata: {} };
        return {
          success: true,
          output: result.content,
          metadata: result.metadata,
        };
      } catch (error) {
        return {
          success: false,
          output: error instanceof Error ? error.message : "MCP call failed.",
          metadata: {},
        };
      }
    },
  };
}
export interface McpToolCall {
  readonly server: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

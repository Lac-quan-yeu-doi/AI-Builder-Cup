import type { JsonObject, JsonValue } from "@domain/shared";
import type { DiagnosticPort } from "../observability/diagnostics.js";
import type { FileAccessPort } from "../storage/file-access.js";

export interface ToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonObject;
  };
}

export type ChatMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string;
      readonly tool_calls?: readonly ChatToolCall[];
    }
  | {
      readonly role: "tool";
      readonly name?: string;
      readonly tool_call_id: string;
      readonly content: string;
    };

export interface ChatToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
  readonly extra_content?: JsonValue;
}

export interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly tool_choice?: "auto";
  readonly stream: true;
  readonly temperature?: number;
  readonly max_tokens?: number;
}

export type ModelStreamEvent =
  | { readonly type: "reasoning"; readonly text: string }
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_call";
      readonly call: {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;
        readonly extraContent?: JsonValue;
      };
    }
  | {
      readonly type: "finish";
      readonly reason:
        "stop" | "length" | "tool_calls" | "content_filter" | "unknown";
    }
  | { readonly type: "usage"; readonly input: number; readonly output: number };

export interface ChatCompletionGateway {
  stream(
    request: ChatCompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}

export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly provider?: string;
  readonly modelThinking?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface ToolGovernanceContext {
  check(input: {
    readonly name: string;
    readonly arguments: JsonObject;
    readonly readOnly: boolean;
  }): ToolGovernanceDecision | Promise<ToolGovernanceDecision>;
  readonly approvalGranted?: boolean;
}

export interface ToolGovernanceDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly code?: string;
}

export interface ToolContext {
  readonly workspaceRoot: string;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly syncWorkspace?: () => Promise<void>;
  readonly sandbox?: {
    readonly enabled: boolean;
    readonly allowedCommands: readonly string[];
    readonly writablePaths: readonly string[];
  };
  readonly governance?: ToolGovernanceContext;
  readonly runId?: string;
  readonly roomId?: string;
  readonly callerSubject?: string;
  readonly authorizationRunId?: string;
  readonly automationRunId?: string;
  readonly automationOrganizationId?: string;
  readonly fileAccess?: FileAccessPort;
  readonly progress?: {
    report(message: string, data?: JsonValue): Promise<void>;
  };
  readonly diagnostics?: DiagnosticPort;
  readonly onToolResult?: (input: {
    readonly name: string;
    readonly arguments: JsonObject;
    readonly result: RuntimeToolResult;
    readonly readOnly: boolean;
    readonly destructive: boolean;
  }) => void | Promise<void>;
}

export type MinderToolCategory =
  | "read"
  | "write"
  | "process"
  | "web"
  | "session"
  | "memory"
  | "meta"
  | "messaging"
  | "automation"
  | "thinking"
  | "mcp";

export interface RuntimeToolResult {
  readonly success: boolean;
  readonly output: string;
  readonly metadata: Record<string, JsonValue>;
}

export interface MinderTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
  readonly category?: MinderToolCategory;
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly aliases?: readonly string[];
  execute?(
    arguments_: JsonObject,
    context: ToolContext,
  ): Promise<RuntimeToolResult>;
}

export interface ToolRegistryPort {
  get(name: string): MinderTool | undefined;
  all(): readonly MinderTool[];
  definitions(): readonly ToolDefinition[];
  /** Create a registry with the supplied tools using this registry's pipeline. */
  withTools(tools: readonly MinderTool[]): ToolRegistryPort;
  execute(
    name: string,
    arguments_: JsonValue,
    context: ToolContext,
  ): Promise<RuntimeToolResult>;
}

export class EmptyToolRegistry implements ToolRegistryPort {
  get(_name: string): MinderTool | undefined {
    return undefined;
  }
  all(): readonly MinderTool[] {
    return [];
  }
  definitions(): readonly ToolDefinition[] {
    return [];
  }
  withTools(tools: readonly MinderTool[]): ToolRegistryPort {
    return new MountedToolRegistry(tools);
  }
  execute(name: string): Promise<RuntimeToolResult> {
    return Promise.resolve({
      success: false,
      output: `Unknown tool: ${name}.`,
      metadata: {},
    });
  }
}

export class ToolRegistryView implements ToolRegistryPort {
  constructor(
    private readonly registry: ToolRegistryPort,
    private readonly tools: readonly MinderTool[],
  ) {}
  get(name: string): MinderTool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }
  all(): readonly MinderTool[] {
    return this.tools;
  }
  definitions(): readonly ToolDefinition[] {
    return this.registry.withTools(this.tools).definitions();
  }
  withTools(tools: readonly MinderTool[]): ToolRegistryPort {
    return this.registry.withTools(tools);
  }
  async execute(
    name: string,
    arguments_: JsonValue,
    context: ToolContext,
  ): Promise<RuntimeToolResult> {
    if (!this.get(name))
      return { success: false, output: `Unknown tool: ${name}.`, metadata: {} };
    return this.registry
      .withTools(this.tools)
      .execute(name, arguments_, context);
  }
}

class MountedToolRegistry implements ToolRegistryPort {
  constructor(private readonly tools: readonly MinderTool[]) {}
  get(name: string): MinderTool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }
  all(): readonly MinderTool[] {
    return this.tools;
  }
  definitions(): readonly ToolDefinition[] {
    return this.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: structuredClone(tool.parameters),
      },
    }));
  }
  withTools(tools: readonly MinderTool[]): ToolRegistryPort {
    return new MountedToolRegistry(tools);
  }
  async execute(
    name: string,
    arguments_: JsonValue,
    context: ToolContext,
  ): Promise<RuntimeToolResult> {
    const tool = this.get(name);
    if (!tool)
      return { success: false, output: `Unknown tool: ${name}.`, metadata: {} };
    if (!tool.execute)
      return {
        success: false,
        output: `Tool ${name} cannot be executed.`,
        metadata: {},
      };
    try {
      return await tool.execute(arguments_ as JsonObject, context);
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : `Tool ${name} failed.`,
        metadata: {},
      };
    }
  }
}

export interface WorkspaceProvider {
  resolve(
    owner: string,
    sessionKey: string,
  ): Promise<{ readonly root: string; readonly prefix: string }>;
  resolvePath(workspaceRoot: string, requested: string): Promise<string>;
  sync(workspace: {
    readonly root: string;
    readonly prefix: string;
  }): Promise<void>;
  tree(
    owner: string,
    roomId: string,
  ): Promise<{
    readonly entries: readonly {
      readonly path: string;
      readonly isDir: boolean;
      readonly sizeBytes?: number;
      readonly modifiedAt: string;
    }[];
  }>;
  read(
    owner: string,
    roomId: string,
    path: string,
  ): Promise<
    | {
        readonly content: Uint8Array;
        readonly contentType: string;
        readonly fileName: string;
      }
    | undefined
  >;
  readSession(
    owner: string,
    sessionKey: string,
    path: string,
    maxBytes?: number,
  ): Promise<
    | {
        readonly content: Uint8Array;
        readonly contentType: string;
        readonly fileName: string;
      }
    | undefined
  >;
}

export interface DataScope {
  readonly catalog?: string;
  readonly schema: string;
}
export interface McpScope {
  readonly allowedCatalogs?: readonly string[];
  readonly dataScope?: DataScope;
}
export interface McpManagerTarget {
  readonly owner: string;
  readonly agent: string;
  readonly server: {
    readonly name: string;
    readonly config: {
      readonly kind: "stdio" | "remote";
      readonly command?: string;
      readonly args?: readonly string[];
      readonly env?: Readonly<Record<string, string>>;
      readonly url?: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly discoveryAllowlist: readonly string[];
    };
  };
  readonly scope: McpScope;
}
export type McpAuditEvent =
  | {
      readonly kind: "discovery";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly toolCount: number;
    }
  | {
      readonly kind: "call";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly tool: string;
      readonly status: "succeeded" | "denied" | "failed";
      readonly code?: string;
    }
  | {
      readonly kind: "reconnect";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly status: "succeeded" | "failed";
    };
export interface McpServerManager {
  setAuditSink?(sink: (event: McpAuditEvent) => void | Promise<void>): void;
  toolsForAgent(
    target: McpManagerTarget,
    context?: {
      readonly runId?: string;
      readonly roomId?: string;
      readonly callerSubject?: string;
      readonly authorizationRunId?: string;
      readonly automationRunId?: string;
      readonly automationOrganizationId?: string;
    },
  ): Promise<readonly MinderTool[]>;
}

export function normalizeDataScope(value: unknown): DataScope | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.schema !== "string") return undefined;
  const schema = record.schema.trim();
  if (schema.length === 0) return undefined;
  const catalog =
    typeof record.catalog === "string" ? record.catalog.trim() : undefined;
  return {
    schema,
    ...(catalog === undefined || catalog.length === 0 ? {} : { catalog }),
  };
}

import type { JsonObject, JsonValue } from "@domain/shared";
import type { ToolSandboxConfig } from "./sandbox.js";
import type {
  DiagnosticPort,
  FileAccessPort,
  ToolProgressSink,
} from "@application/shared/ports/index.js";

export interface ToolGovernanceCheckInput {
  readonly name: string;
  readonly arguments: JsonObject;
  readonly readOnly: boolean;
}

export interface ToolGovernanceDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Stable machine-readable reason for UI and audit consumers. */
  readonly code?: string;
}

export interface ToolGovernanceContext {
  readonly check: (
    input: ToolGovernanceCheckInput,
  ) => ToolGovernanceDecision | Promise<ToolGovernanceDecision>;
  /** Set only for the exact call resumed from a verified approval. */
  readonly approvalGranted?: boolean;
}

export interface ToolContext {
  readonly workspaceRoot: string;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly syncWorkspace?: () => Promise<void>;
  readonly sandbox?: ToolSandboxConfig;
  readonly governance?: ToolGovernanceContext;
  /** Trusted runtime identity; never populated from model tool arguments. */
  readonly runId?: string;
  readonly roomId?: string;
  readonly callerSubject?: string;
  readonly authorizationRunId?: string;
  readonly automationRunId?: string;
  readonly automationOrganizationId?: string;
  readonly fileAccess?: FileAccessPort;
  /** Runtime-owned progress reporting; never populated from tool arguments. */
  readonly progress?: ToolProgressSink;
  /** Runtime-owned diagnostic recorder; never populated from tool arguments. */
  readonly diagnostics?: DiagnosticPort;
  readonly onToolResult?: (input: {
    readonly name: string;
    readonly arguments: JsonObject;
    readonly result: ToolResult;
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

export interface ToolResult {
  success: boolean;
  output: string;
  metadata: Record<string, JsonValue>;
}

export interface MinderTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
  readonly outputLimit?: number;
  readonly category?: MinderToolCategory;
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly aliases?: readonly string[];
  execute?(arguments_: JsonObject, context: ToolContext): Promise<ToolResult>;
}

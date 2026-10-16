import type {
  JsonObject,
  JsonValue,
  RoomId,
  RunId,
  SessionId,
  WorkspacePath,
} from "@domain/index.js";
import type { DiagnosticPort } from "../observability/diagnostics.js";
import type { FileAccessPort } from "../storage/file-access.js";
export type ToolCategory =
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
export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
  readonly category: ToolCategory;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly aliases: readonly string[];
}
export interface ToolResult {
  readonly success: boolean;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly overflow?: string;
}
export interface ToolProgressSink {
  report(message: string, data?: JsonValue): Promise<void>;
}
export interface ToolTimeout {
  readonly milliseconds: number;
}
export interface ToolExecutionContext {
  readonly workspace: WorkspacePath;
  readonly workspaceRoot?: WorkspacePath;
  readonly sessionId?: SessionId;
  readonly runId?: RunId;
  readonly roomId?: RoomId;
  readonly signal: AbortSignal;
  readonly timeout?: ToolTimeout;
  readonly progress?: ToolProgressSink;
  readonly diagnostics?: DiagnosticPort;
  readonly fileAccess?: FileAccessPort;
  readonly values: ReadonlyMap<string, JsonValue>;
}
export interface ToolPort {
  readonly descriptor: ToolDescriptor;
  readonly outputLimit?: number;
  execute(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult>;
}

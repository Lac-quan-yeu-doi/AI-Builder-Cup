import type { JsonObject } from "@domain/index.js";
import type { McpManagerTarget } from "./external.js";

export interface HttpMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

export interface HttpMcpServerStatus {
  readonly owner: string;
  readonly agent: string;
  readonly server: string;
  readonly kind: "stdio" | "remote";
  readonly state:
    "connecting" | "ready" | "degraded" | "unavailable" | "closed";
  readonly toolCount: number;
  readonly attempts: number;
  readonly lastError?: string;
}

export interface HttpMcpManager {
  discover(target: McpManagerTarget): Promise<readonly HttpMcpTool[]>;
  status(owner?: string): Promise<readonly HttpMcpServerStatus[]>;
  reconnect(target: McpManagerTarget): Promise<HttpMcpServerStatus>;
}

export interface ToolCatalogPort {
  descriptors(): readonly {
    readonly name: string;
    readonly kind: "local" | "prompt_only" | "mcp";
    readonly aliases: readonly string[];
    readonly state: string;
  }[];
  implementedNames(): readonly string[];
}

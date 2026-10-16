import type { JsonObject } from "@domain/index.js";
import type { GovernancePolicy } from "../policy/governance-manifest.js";
import type { PromptSource } from "../context/prompts.js";
export type ToolsMode = "allowlist" | "denylist" | "all";
export interface ModelConfig {
  readonly provider?: string;
  readonly name?: string;
  readonly thinking?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}
export interface McpServerConfig {
  readonly kind: "stdio" | "remote";
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly discoveryAllowlist: readonly string[];
}
export interface ClientToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
}
export interface AgentManifest {
  readonly name: string;
  readonly description: string;
  readonly model: ModelConfig;
  readonly systemPrompt: PromptSource;
  readonly tools: {
    readonly mode: ToolsMode;
    readonly names: readonly string[];
  };
  readonly workingDirectory: string;
  readonly execution: {
    readonly mode: "autonomous" | "interactive";
    readonly maxIterations: number;
    readonly planReview?: boolean;
    readonly interruptOnCost?: number;
  };
  readonly handoff?: {
    readonly canDelegateTo: readonly string[];
    readonly acceptsFrom: readonly string[];
  };
  readonly tags: readonly string[];
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>;
  readonly clientTools: readonly ClientToolSpec[];
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  readonly autoApprovals?: readonly string[];
  readonly governance?: GovernancePolicy;
  /** Project skills this manifest may compose into its runtime profile. */
  readonly skills: readonly string[];
}

export interface ResolvedAgentManifest extends AgentManifest {
  readonly governance: GovernancePolicy;
}

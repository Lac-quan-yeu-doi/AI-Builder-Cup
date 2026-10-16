import type { AgentId, SkillName } from "../values/ids.js";

export type AgentExecutionStrategy = "react";
export interface AgentDefinition {
  readonly id: AgentId;
  readonly name: string;
  readonly displayName?: string;
  readonly systemPrompt?: string;
  readonly model?: string;
  readonly toolAllowlist: readonly string[];
  readonly skills: readonly SkillName[];
  readonly maxSteps?: number;
  readonly executionStrategy: AgentExecutionStrategy;
  readonly archivedAt?: string;
}

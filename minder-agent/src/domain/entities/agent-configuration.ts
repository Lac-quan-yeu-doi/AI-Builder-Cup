import { agentId, skillName, type AgentId } from "../values/ids.js";
import type { AgentDefinition } from "./agent.js";

export interface AgentConfigurationInput {
  readonly id: string;
  readonly name: string;
  readonly displayName?: string;
  readonly systemPrompt?: string;
  readonly model?: string;
  readonly toolAllowlist: readonly string[];
  readonly skills: readonly string[];
  readonly maxSteps?: number;
  readonly executionStrategy: "react";
}

const IDENTIFIER = /^[a-z0-9][a-z0-9-]*$/;

function validateList(label: string, values: readonly string[]): void {
  if (values.some((value) => value.trim().length === 0))
    throw new Error(`${label} cannot contain blank values`);
  if (new Set(values).size !== values.length)
    throw new Error(`${label} cannot contain duplicate values`);
}

export function validateAgentConfiguration(
  input: AgentConfigurationInput,
): AgentDefinition {
  if (!IDENTIFIER.test(input.id))
    throw new Error("id must be lowercase kebab-case");
  if (!IDENTIFIER.test(input.name))
    throw new Error("name must be lowercase kebab-case");
  if (
    input.maxSteps !== undefined &&
    (!Number.isInteger(input.maxSteps) || input.maxSteps <= 0)
  )
    throw new Error("maxSteps must be a positive integer");
  validateList("toolAllowlist", input.toolAllowlist);
  validateList("skills", input.skills);
  return {
    executionStrategy: input.executionStrategy,
    id: agentId(input.id),
    ...(input.displayName === undefined
      ? {}
      : { displayName: input.displayName }),
    ...(input.maxSteps === undefined ? {} : { maxSteps: input.maxSteps }),
    ...(input.model === undefined ? {} : { model: input.model }),
    name: input.name,
    skills: input.skills.map((value) => skillName(value)),
    ...(input.systemPrompt === undefined
      ? {}
      : { systemPrompt: input.systemPrompt }),
    toolAllowlist: [...input.toolAllowlist],
  };
}

export function canonicalAgentConfiguration(agent: AgentDefinition): string {
  return JSON.stringify({
    archivedAt: agent.archivedAt ?? null,
    displayName: agent.displayName ?? null,
    executionStrategy: agent.executionStrategy,
    id: agent.id,
    maxSteps: agent.maxSteps ?? null,
    model: agent.model ?? null,
    name: agent.name,
    skills: agent.skills,
    systemPrompt: agent.systemPrompt ?? null,
    toolAllowlist: agent.toolAllowlist,
  });
}

export function agentConfigurationHash(
  agent: AgentDefinition,
  sha256: (value: string) => string,
): string {
  return sha256(canonicalAgentConfiguration(agent));
}

export type { AgentId };

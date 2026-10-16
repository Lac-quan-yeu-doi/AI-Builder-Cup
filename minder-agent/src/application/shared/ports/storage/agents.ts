import type { AgentDefinition, AgentId } from "@domain/index.js";
export interface AgentPort {
  get(id: AgentId): Promise<AgentDefinition | undefined>;
  getByName(name: string): Promise<AgentDefinition | undefined>;
  list(includeArchived?: boolean): Promise<readonly AgentDefinition[]>;
  save(agent: AgentDefinition): Promise<void>;
  archive(id: AgentId): Promise<void>;
}

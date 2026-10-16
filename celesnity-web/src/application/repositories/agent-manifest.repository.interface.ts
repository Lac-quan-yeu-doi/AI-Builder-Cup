import type {
  AgentManifest,
  AgentManifestSummary,
  SaveAgentManifestInput,
} from '@/src/entities/models/agent-manifest';

export interface AgentManifestRepository {
  list(): Promise<readonly AgentManifestSummary[]>;
  get(name: string): Promise<AgentManifest>;
  validate(yaml: string): Promise<AgentManifest>;
  save(input: SaveAgentManifestInput): Promise<AgentManifest>;
  delete(name: string): Promise<void>;
}

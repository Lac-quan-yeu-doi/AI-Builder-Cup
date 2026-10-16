import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';
import type { AgentManifestSummary } from '@/src/entities/models/agent-manifest';

export type ListAgentManifestsUseCase = () => Promise<readonly AgentManifestSummary[]>;

export const createListAgentManifestsUseCase =
  (repository: AgentManifestRepository): ListAgentManifestsUseCase =>
  (): Promise<readonly AgentManifestSummary[]> => {
    return repository.list();
  };

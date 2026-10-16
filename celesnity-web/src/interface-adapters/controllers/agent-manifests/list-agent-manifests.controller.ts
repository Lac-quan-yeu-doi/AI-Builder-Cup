import type { ListAgentManifestsUseCase } from '@/src/application/use-cases/agent-manifests/list-agent-manifests.use-case';
import type { AgentManifestSummary } from '@/src/entities/models/agent-manifest';

export type ListAgentManifestsController = () => Promise<readonly AgentManifestSummary[]>;

export const createListAgentManifestsController =
  (useCase: ListAgentManifestsUseCase): ListAgentManifestsController =>
  (): Promise<readonly AgentManifestSummary[]> => {
    return useCase();
  };

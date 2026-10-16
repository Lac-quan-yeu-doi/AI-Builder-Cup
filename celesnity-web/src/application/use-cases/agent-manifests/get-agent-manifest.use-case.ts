import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';

export type GetAgentManifestUseCase = ReturnType<typeof createGetAgentManifestUseCase>;

export const createGetAgentManifestUseCase =
  (repository: AgentManifestRepository) => (name: string) =>
    repository.get(name);

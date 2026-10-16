import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';

export type DeleteAgentManifestUseCase = ReturnType<typeof createDeleteAgentManifestUseCase>;

export const createDeleteAgentManifestUseCase =
  (repository: AgentManifestRepository) => (name: string) =>
    repository.delete(name);

import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';
import type { SaveAgentManifestInput } from '@/src/entities/models/agent-manifest';

export type SaveAgentManifestUseCase = ReturnType<typeof createSaveAgentManifestUseCase>;

export const createSaveAgentManifestUseCase =
  (repository: AgentManifestRepository) => (input: SaveAgentManifestInput) =>
    repository.save(input);

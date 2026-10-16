import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';

export type ValidateAgentManifestUseCase = ReturnType<typeof createValidateAgentManifestUseCase>;

export const createValidateAgentManifestUseCase =
  (repository: AgentManifestRepository) => (yaml: string) =>
    repository.validate(yaml);

import type { GetAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/get-agent-manifest.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { AgentManifest } from '@/src/entities/models/agent-manifest';

export type GetAgentManifestController = (name: string) => Promise<AgentManifest>;

export const createGetAgentManifestController =
  (useCase: GetAgentManifestUseCase): GetAgentManifestController =>
  async (name) => {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new InputParseError('Invalid agent manifest name');
    }
    return useCase(name);
  };

import type { SaveAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/save-agent-manifest.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { AgentManifest, SaveAgentManifestInput } from '@/src/entities/models/agent-manifest';

export type SaveAgentManifestController = (input: SaveAgentManifestInput) => Promise<AgentManifest>;

export const createSaveAgentManifestController =
  (useCase: SaveAgentManifestUseCase): SaveAgentManifestController =>
  async (input) => {
    if (
      typeof input !== 'object' ||
      input === null ||
      typeof input.name !== 'string' ||
      input.name.trim() === '' ||
      typeof input.yaml !== 'string' ||
      input.yaml.trim() === ''
    ) {
      throw new InputParseError('Invalid agent manifest');
    }
    return useCase(input);
  };

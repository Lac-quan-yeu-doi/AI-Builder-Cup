import type { ValidateAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/validate-agent-manifest.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { AgentManifest } from '@/src/entities/models/agent-manifest';

export type ValidateAgentManifestController = (yaml: string) => Promise<AgentManifest>;

export const createValidateAgentManifestController =
  (useCase: ValidateAgentManifestUseCase): ValidateAgentManifestController =>
  async (yaml) => {
    if (typeof yaml !== 'string' || yaml.trim() === '') {
      throw new InputParseError('Invalid agent manifest YAML');
    }
    return useCase(yaml);
  };

import type { DeleteAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/delete-agent-manifest.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

export type DeleteAgentManifestController = (name: string) => Promise<void>;

export const createDeleteAgentManifestController =
  (useCase: DeleteAgentManifestUseCase): DeleteAgentManifestController =>
  async (name) => {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new InputParseError('Invalid agent manifest name');
    }
    await useCase(name);
  };

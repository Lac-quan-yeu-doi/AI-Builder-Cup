import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListAgentManifestsUseCase } from '@/src/application/use-cases/agent-manifests/list-agent-manifests.use-case';
import { createGetAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/get-agent-manifest.use-case';
import { createSaveAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/save-agent-manifest.use-case';
import { createValidateAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/validate-agent-manifest.use-case';
import { createDeleteAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/delete-agent-manifest.use-case';
import { AgentApiAgentManifestRepository } from '@/src/infrastructure/repositories/agent-api-agent-manifest.repository';
import { createListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';
import { createGetAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/get-agent-manifest.controller';
import { createSaveAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/save-agent-manifest.controller';
import { createValidateAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/validate-agent-manifest.controller';
import { createDeleteAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/delete-agent-manifest.controller';

export function createAgentManifestsModule() {
  const agentManifestsModule = createTypedModule();

  agentManifestsModule
    .bind(DI_SYMBOLS.AgentManifestRepository)
    .toClass(AgentApiAgentManifestRepository, [DI_SYMBOLS.AgentApiClient]);

  agentManifestsModule
    .bind(DI_SYMBOLS.ListAgentManifestsUseCase)
    .toHigherOrderFunction(createListAgentManifestsUseCase, [DI_SYMBOLS.AgentManifestRepository]);
  agentManifestsModule
    .bind(DI_SYMBOLS.GetAgentManifestUseCase)
    .toHigherOrderFunction(createGetAgentManifestUseCase, [DI_SYMBOLS.AgentManifestRepository]);
  agentManifestsModule
    .bind(DI_SYMBOLS.SaveAgentManifestUseCase)
    .toHigherOrderFunction(createSaveAgentManifestUseCase, [DI_SYMBOLS.AgentManifestRepository]);
  agentManifestsModule
    .bind(DI_SYMBOLS.ValidateAgentManifestUseCase)
    .toHigherOrderFunction(createValidateAgentManifestUseCase, [
      DI_SYMBOLS.AgentManifestRepository,
    ]);
  agentManifestsModule
    .bind(DI_SYMBOLS.DeleteAgentManifestUseCase)
    .toHigherOrderFunction(createDeleteAgentManifestUseCase, [DI_SYMBOLS.AgentManifestRepository]);

  agentManifestsModule
    .bind(DI_SYMBOLS.ListAgentManifestsController)
    .toHigherOrderFunction(createListAgentManifestsController, [
      DI_SYMBOLS.ListAgentManifestsUseCase,
    ]);
  agentManifestsModule
    .bind(DI_SYMBOLS.GetAgentManifestController)
    .toHigherOrderFunction(createGetAgentManifestController, [DI_SYMBOLS.GetAgentManifestUseCase]);
  agentManifestsModule
    .bind(DI_SYMBOLS.SaveAgentManifestController)
    .toHigherOrderFunction(createSaveAgentManifestController, [
      DI_SYMBOLS.SaveAgentManifestUseCase,
    ]);
  agentManifestsModule
    .bind(DI_SYMBOLS.ValidateAgentManifestController)
    .toHigherOrderFunction(createValidateAgentManifestController, [
      DI_SYMBOLS.ValidateAgentManifestUseCase,
    ]);
  agentManifestsModule
    .bind(DI_SYMBOLS.DeleteAgentManifestController)
    .toHigherOrderFunction(createDeleteAgentManifestController, [
      DI_SYMBOLS.DeleteAgentManifestUseCase,
    ]);

  return agentManifestsModule;
}

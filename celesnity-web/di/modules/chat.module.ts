import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createManageChatUseCase } from '@/src/application/use-cases/chat/manage-chat.use-case';
import { AgentApiChatRepository } from '@/src/infrastructure/repositories/agent-api-chat.repository';
import { createManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';

export function createChatModule() {
  const chatModule = createTypedModule();
  chatModule
    .bind(DI_SYMBOLS.ChatRepository)
    .toClass(AgentApiChatRepository, [DI_SYMBOLS.AgentApiClient, DI_SYMBOLS.CoreApiClient]);
  chatModule
    .bind(DI_SYMBOLS.ManageChatUseCase)
    .toHigherOrderFunction(createManageChatUseCase, [DI_SYMBOLS.ChatRepository]);
  chatModule
    .bind(DI_SYMBOLS.ManageChatController)
    .toHigherOrderFunction(createManageChatController, [DI_SYMBOLS.ManageChatUseCase]);
  return chatModule;
}

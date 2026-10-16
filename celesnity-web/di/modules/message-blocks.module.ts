import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListMessageBlockHistoryUseCase } from '@/src/application/use-cases/message-blocks/list-message-block-history.use-case';
import { createSubscribeMessageBlocksUseCase } from '@/src/application/use-cases/message-blocks/subscribe-message-blocks.use-case';
import { CoreApiMessageBlockRepository } from '@/src/infrastructure/repositories/core-api-message-block.repository';
import { EventSourceMessageBlockProgressService } from '@/src/infrastructure/services/event-source-message-block-progress.service';
import { createListMessageBlockHistoryController } from '@/src/interface-adapters/controllers/message-blocks/list-message-block-history.controller';
import { createSubscribeMessageBlocksController } from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';

export function createMessageBlocksModule() {
  const messageBlocksModule = createTypedModule();

  messageBlocksModule
    .bind(DI_SYMBOLS.MessageBlockRepository)
    .toClass(CoreApiMessageBlockRepository, [DI_SYMBOLS.CoreApiClient]);
  messageBlocksModule
    .bind(DI_SYMBOLS.MessageBlockProgressService)
    .toClass(EventSourceMessageBlockProgressService);

  messageBlocksModule
    .bind(DI_SYMBOLS.ListMessageBlockHistoryUseCase)
    .toHigherOrderFunction(createListMessageBlockHistoryUseCase, [
      DI_SYMBOLS.MessageBlockRepository,
    ]);
  messageBlocksModule
    .bind(DI_SYMBOLS.SubscribeMessageBlocksUseCase)
    .toHigherOrderFunction(createSubscribeMessageBlocksUseCase, [
      DI_SYMBOLS.MessageBlockProgressService,
    ]);

  messageBlocksModule
    .bind(DI_SYMBOLS.ListMessageBlockHistoryController)
    .toHigherOrderFunction(createListMessageBlockHistoryController, [
      DI_SYMBOLS.ListMessageBlockHistoryUseCase,
    ]);
  messageBlocksModule
    .bind(DI_SYMBOLS.SubscribeMessageBlocksController)
    .toHigherOrderFunction(createSubscribeMessageBlocksController, [
      DI_SYMBOLS.SubscribeMessageBlocksUseCase,
    ]);

  return messageBlocksModule;
}

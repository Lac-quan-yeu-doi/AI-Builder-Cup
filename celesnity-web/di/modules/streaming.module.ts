import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createManageStreamAdaptersUseCase } from '@/src/application/use-cases/streaming/manage-stream-adapters.use-case';
import { CoreApiStreamingRepository } from '@/src/infrastructure/repositories/core-api-streaming.repository';
import { createManageStreamAdaptersController } from '@/src/interface-adapters/controllers/streaming/manage-stream-adapters.controller';

export function createStreamingModule() {
  const streamingModule = createTypedModule();
  streamingModule
    .bind(DI_SYMBOLS.StreamingRepository)
    .toClass(CoreApiStreamingRepository, [DI_SYMBOLS.CoreApiClient]);
  streamingModule
    .bind(DI_SYMBOLS.ManageStreamAdaptersUseCase)
    .toHigherOrderFunction(createManageStreamAdaptersUseCase, [DI_SYMBOLS.StreamingRepository]);
  streamingModule
    .bind(DI_SYMBOLS.ManageStreamAdaptersController)
    .toHigherOrderFunction(createManageStreamAdaptersController, [
      DI_SYMBOLS.ManageStreamAdaptersUseCase,
    ]);
  return streamingModule;
}

import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createArchiveConnectionUseCase } from '@/src/application/use-cases/connections/archive-connection.use-case';
import { createCreateConnectionUseCase } from '@/src/application/use-cases/connections/create-connection.use-case';
import { createGetConnectionUseCase } from '@/src/application/use-cases/connections/get-connection.use-case';
import { createListConnectionsUseCase } from '@/src/application/use-cases/connections/list-connections.use-case';
import { createTestSavedConnectionUseCase } from '@/src/application/use-cases/connections/test-saved-connection.use-case';
import { createTestUnsavedConnectionUseCase } from '@/src/application/use-cases/connections/test-unsaved-connection.use-case';
import { createUpdateConnectionUseCase } from '@/src/application/use-cases/connections/update-connection.use-case';
import { CoreApiConnectionRepository } from '@/src/infrastructure/repositories/core-api-connection.repository';
import { createArchiveConnectionController } from '@/src/interface-adapters/controllers/connections/archive-connection.controller';
import { createCreateConnectionController } from '@/src/interface-adapters/controllers/connections/create-connection.controller';
import { createGetConnectionController } from '@/src/interface-adapters/controllers/connections/get-connection.controller';
import { createListConnectionsController } from '@/src/interface-adapters/controllers/connections/list-connections.controller';
import { createTestSavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-saved-connection.controller';
import { createTestUnsavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-unsaved-connection.controller';
import { createUpdateConnectionController } from '@/src/interface-adapters/controllers/connections/update-connection.controller';

export function createConnectionsModule() {
  const connectionsModule = createTypedModule();

  connectionsModule
    .bind(DI_SYMBOLS.ConnectionRepository)
    .toClass(CoreApiConnectionRepository, [DI_SYMBOLS.CoreApiClient]);
  connectionsModule
    .bind(DI_SYMBOLS.ListConnectionsUseCase)
    .toHigherOrderFunction(createListConnectionsUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.GetConnectionUseCase)
    .toHigherOrderFunction(createGetConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.TestUnsavedConnectionUseCase)
    .toHigherOrderFunction(createTestUnsavedConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.TestSavedConnectionUseCase)
    .toHigherOrderFunction(createTestSavedConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.CreateConnectionUseCase)
    .toHigherOrderFunction(createCreateConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.UpdateConnectionUseCase)
    .toHigherOrderFunction(createUpdateConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);
  connectionsModule
    .bind(DI_SYMBOLS.ArchiveConnectionUseCase)
    .toHigherOrderFunction(createArchiveConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);

  connectionsModule
    .bind(DI_SYMBOLS.ListConnectionsController)
    .toHigherOrderFunction(createListConnectionsController, [DI_SYMBOLS.ListConnectionsUseCase]);
  connectionsModule
    .bind(DI_SYMBOLS.GetConnectionController)
    .toHigherOrderFunction(createGetConnectionController, [DI_SYMBOLS.GetConnectionUseCase]);
  connectionsModule
    .bind(DI_SYMBOLS.TestUnsavedConnectionController)
    .toHigherOrderFunction(createTestUnsavedConnectionController, [
      DI_SYMBOLS.TestUnsavedConnectionUseCase,
    ]);
  connectionsModule
    .bind(DI_SYMBOLS.TestSavedConnectionController)
    .toHigherOrderFunction(createTestSavedConnectionController, [
      DI_SYMBOLS.TestSavedConnectionUseCase,
    ]);
  connectionsModule
    .bind(DI_SYMBOLS.CreateConnectionController)
    .toHigherOrderFunction(createCreateConnectionController, [DI_SYMBOLS.CreateConnectionUseCase]);
  connectionsModule
    .bind(DI_SYMBOLS.UpdateConnectionController)
    .toHigherOrderFunction(createUpdateConnectionController, [DI_SYMBOLS.UpdateConnectionUseCase]);
  connectionsModule
    .bind(DI_SYMBOLS.ArchiveConnectionController)
    .toHigherOrderFunction(createArchiveConnectionController, [
      DI_SYMBOLS.ArchiveConnectionUseCase,
    ]);

  return connectionsModule;
}

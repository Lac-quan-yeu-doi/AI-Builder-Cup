import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createArchiveDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/archive-database-service.use-case';
import { createAttachDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/attach-database-service.use-case';
import { createCdcConnectionProfileUseCases } from '@/src/application/use-cases/database-services/cdc-connection-profile.use-cases';
import { createCreateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/create-database-service.use-case';
import { createGetDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/get-database-service.use-case';
import { createListDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-database-services.use-case';
import { createListAvailableDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-available-database-services.use-case';
import { createListDatabaseServiceConnectorsUseCase } from '@/src/application/use-cases/database-services/list-database-service-connectors.use-case';
import { createTestSavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-saved-database-service.use-case';
import { createTestUnsavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-unsaved-database-service.use-case';
import { createUpdateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/update-database-service.use-case';
import { createDetachDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/detach-database-service.use-case';
import { CoreApiDatabaseServiceRepository } from '@/src/infrastructure/repositories/core-api-database-service.repository';
import { createArchiveDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/archive-database-service.controller';
import { createAttachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/attach-database-service.controller';
import { createCdcConnectionProfileController } from '@/src/interface-adapters/controllers/database-services/cdc-connection-profile.controller';
import { createCreateDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/create-database-service.controller';
import { createGetDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/get-database-service.controller';
import { createListDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-database-services.controller';
import { createListAvailableDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-available-database-services.controller';
import { createListDatabaseServiceConnectorsController } from '@/src/interface-adapters/controllers/database-services/list-database-service-connectors.controller';
import { createTestSavedDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/test-saved-database-service.controller';
import { createTestUnsavedDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/test-unsaved-database-service.controller';
import { createUpdateDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/update-database-service.controller';
import { createDetachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/detach-database-service.controller';

export function createDatabaseServicesModule() {
  const databaseServicesModule = createTypedModule();

  databaseServicesModule
    .bind(DI_SYMBOLS.DatabaseServiceRepository)
    .toClass(CoreApiDatabaseServiceRepository, [DI_SYMBOLS.CoreApiClient]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ListDatabaseServicesUseCase)
    .toHigherOrderFunction(createListDatabaseServicesUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ListDatabaseServiceConnectorsUseCase)
    .toHigherOrderFunction(createListDatabaseServiceConnectorsUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.GetDatabaseServiceUseCase)
    .toHigherOrderFunction(createGetDatabaseServiceUseCase, [DI_SYMBOLS.DatabaseServiceRepository]);
  databaseServicesModule
    .bind(DI_SYMBOLS.TestUnsavedDatabaseServiceUseCase)
    .toHigherOrderFunction(createTestUnsavedDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.TestSavedDatabaseServiceUseCase)
    .toHigherOrderFunction(createTestSavedDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.CreateDatabaseServiceUseCase)
    .toHigherOrderFunction(createCreateDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.UpdateDatabaseServiceUseCase)
    .toHigherOrderFunction(createUpdateDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ArchiveDatabaseServiceUseCase)
    .toHigherOrderFunction(createArchiveDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ListAvailableDatabaseServicesUseCase)
    .toHigherOrderFunction(createListAvailableDatabaseServicesUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.AttachDatabaseServiceUseCase)
    .toHigherOrderFunction(createAttachDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.DetachDatabaseServiceUseCase)
    .toHigherOrderFunction(createDetachDatabaseServiceUseCase, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.CdcConnectionProfileUseCases)
    .toHigherOrderFunction(createCdcConnectionProfileUseCases, [
      DI_SYMBOLS.DatabaseServiceRepository,
    ]);

  databaseServicesModule
    .bind(DI_SYMBOLS.ListDatabaseServicesController)
    .toHigherOrderFunction(createListDatabaseServicesController, [
      DI_SYMBOLS.ListDatabaseServicesUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ListDatabaseServiceConnectorsController)
    .toHigherOrderFunction(createListDatabaseServiceConnectorsController, [
      DI_SYMBOLS.ListDatabaseServiceConnectorsUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.GetDatabaseServiceController)
    .toHigherOrderFunction(createGetDatabaseServiceController, [
      DI_SYMBOLS.GetDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.TestUnsavedDatabaseServiceController)
    .toHigherOrderFunction(createTestUnsavedDatabaseServiceController, [
      DI_SYMBOLS.TestUnsavedDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.TestSavedDatabaseServiceController)
    .toHigherOrderFunction(createTestSavedDatabaseServiceController, [
      DI_SYMBOLS.TestSavedDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.CreateDatabaseServiceController)
    .toHigherOrderFunction(createCreateDatabaseServiceController, [
      DI_SYMBOLS.CreateDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.UpdateDatabaseServiceController)
    .toHigherOrderFunction(createUpdateDatabaseServiceController, [
      DI_SYMBOLS.UpdateDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ArchiveDatabaseServiceController)
    .toHigherOrderFunction(createArchiveDatabaseServiceController, [
      DI_SYMBOLS.ArchiveDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.ListAvailableDatabaseServicesController)
    .toHigherOrderFunction(createListAvailableDatabaseServicesController, [
      DI_SYMBOLS.ListAvailableDatabaseServicesUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.AttachDatabaseServiceController)
    .toHigherOrderFunction(createAttachDatabaseServiceController, [
      DI_SYMBOLS.AttachDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.DetachDatabaseServiceController)
    .toHigherOrderFunction(createDetachDatabaseServiceController, [
      DI_SYMBOLS.DetachDatabaseServiceUseCase,
    ]);
  databaseServicesModule
    .bind(DI_SYMBOLS.CdcConnectionProfileController)
    .toHigherOrderFunction(createCdcConnectionProfileController, [
      DI_SYMBOLS.CdcConnectionProfileUseCases,
    ]);

  return databaseServicesModule;
}

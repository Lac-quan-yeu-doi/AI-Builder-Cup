import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createLoadAdministrationSessionUseCase } from '@/src/application/use-cases/administration/load-administration-session.use-case';
import { CoreApiAdministrationRepository } from '@/src/infrastructure/repositories/core-api-administration.repository';
import { createLoadAdministrationSessionController } from '@/src/interface-adapters/controllers/administration/load-administration-session.controller';

/** Retain only the session feature-grant reader used by the workspace shell. */
export function createAdministrationModule() {
  const administrationModule = createTypedModule();
  administrationModule
    .bind(DI_SYMBOLS.AdministrationRepository)
    .toClass(CoreApiAdministrationRepository, [DI_SYMBOLS.CoreApiClient]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationSessionUseCase)
    .toHigherOrderFunction(createLoadAdministrationSessionUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationSessionController)
    .toHigherOrderFunction(createLoadAdministrationSessionController, [
      DI_SYMBOLS.LoadAdministrationSessionUseCase,
    ]);
  return administrationModule;
}

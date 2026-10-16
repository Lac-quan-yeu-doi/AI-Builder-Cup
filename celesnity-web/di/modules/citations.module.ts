import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createResolveCitationsUseCase } from '@/src/application/use-cases/citations/resolve-citations.use-case';
import { CoreApiCitationRepository } from '@/src/infrastructure/repositories/core-api-citation.repository';
import { createResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';

export function createCitationsModule() {
  const citationsModule = createTypedModule();

  citationsModule
    .bind(DI_SYMBOLS.CitationRepository)
    .toClass(CoreApiCitationRepository, [DI_SYMBOLS.CoreApiClient]);

  citationsModule
    .bind(DI_SYMBOLS.ResolveCitationsUseCase)
    .toHigherOrderFunction(createResolveCitationsUseCase, [DI_SYMBOLS.CitationRepository]);

  citationsModule
    .bind(DI_SYMBOLS.ResolveCitationsController)
    .toHigherOrderFunction(createResolveCitationsController, [DI_SYMBOLS.ResolveCitationsUseCase]);

  return citationsModule;
}

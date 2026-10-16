import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
export type LoadAdministrationSessionUseCase = ReturnType<
  typeof createLoadAdministrationSessionUseCase
>;
export const createLoadAdministrationSessionUseCase =
  (repository: AdministrationRepository) => () =>
    repository.loadSession();

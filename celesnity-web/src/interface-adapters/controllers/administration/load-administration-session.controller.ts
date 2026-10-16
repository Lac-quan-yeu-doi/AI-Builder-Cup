import type { LoadAdministrationSessionUseCase } from '@/src/application/use-cases/administration/load-administration-session.use-case';
export type LoadAdministrationSessionController = ReturnType<
  typeof createLoadAdministrationSessionController
>;
export const createLoadAdministrationSessionController =
  (useCase: LoadAdministrationSessionUseCase) => () =>
    useCase();

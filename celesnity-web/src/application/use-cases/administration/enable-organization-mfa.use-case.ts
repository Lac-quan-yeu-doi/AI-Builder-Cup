import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';

export type EnableOrganizationMfaUseCase = () => Promise<void>;
export const createEnableOrganizationMfaUseCase =
  (repository: AdministrationRepository): EnableOrganizationMfaUseCase =>
  () =>
    repository.enableMfa();

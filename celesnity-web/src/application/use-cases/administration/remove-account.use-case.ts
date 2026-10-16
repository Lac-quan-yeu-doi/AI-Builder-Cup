import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';

export type RemoveAccountUseCase = (membershipId: string) => Promise<void>;
export const createRemoveAccountUseCase = (
  repository: AdministrationRepository,
): RemoveAccountUseCase => repository.removeAccount.bind(repository);

import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';

export type DeleteCatalogGrantUseCase = (grantId: string) => Promise<void>;
export const createDeleteCatalogGrantUseCase = (
  repository: AdministrationRepository,
): DeleteCatalogGrantUseCase => repository.deleteCatalogGrant.bind(repository);

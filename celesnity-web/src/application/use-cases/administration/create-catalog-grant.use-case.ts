import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type {
  CatalogAccessGrant,
  CreateCatalogGrantInput,
} from '@/src/entities/models/administration';

export type CreateCatalogGrantUseCase = (
  input: CreateCatalogGrantInput,
) => Promise<CatalogAccessGrant>;
export const createCatalogGrantUseCase =
  (repository: AdministrationRepository): CreateCatalogGrantUseCase =>
  (input): Promise<CatalogAccessGrant> =>
    repository.createCatalogGrant({ ...input, resourceId: input.resourceId.trim() });

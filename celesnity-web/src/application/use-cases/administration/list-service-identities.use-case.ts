import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { ServiceIdentitySummary } from '@/src/entities/models/administration';

export type ListServiceIdentitiesUseCase = () => Promise<readonly ServiceIdentitySummary[]>;

export const createListServiceIdentitiesUseCase = (
  repository: AdministrationRepository,
): ListServiceIdentitiesUseCase => repository.listServiceIdentities.bind(repository);

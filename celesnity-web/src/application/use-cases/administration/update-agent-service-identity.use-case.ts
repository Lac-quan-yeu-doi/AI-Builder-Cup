import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type {
  ServiceIdentitySummary,
  UpdateAgentServiceIdentityInput,
} from '@/src/entities/models/administration';

export type UpdateAgentServiceIdentityUseCase = (
  input: UpdateAgentServiceIdentityInput,
) => Promise<ServiceIdentitySummary>;

export const createUpdateAgentServiceIdentityUseCase = (
  repository: AdministrationRepository,
): UpdateAgentServiceIdentityUseCase => repository.updateAgentServiceIdentity.bind(repository);

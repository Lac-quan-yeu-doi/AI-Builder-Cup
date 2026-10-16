import type { ListServiceIdentitiesUseCase } from '@/src/application/use-cases/administration/list-service-identities.use-case';
import type { UpdateAgentServiceIdentityUseCase } from '@/src/application/use-cases/administration/update-agent-service-identity.use-case';

export type ListServiceIdentitiesController = ListServiceIdentitiesUseCase;
export const createListServiceIdentitiesController = (
  useCase: ListServiceIdentitiesUseCase,
): ListServiceIdentitiesController => useCase;

export type UpdateAgentServiceIdentityController = UpdateAgentServiceIdentityUseCase;
export const createUpdateAgentServiceIdentityController = (
  useCase: UpdateAgentServiceIdentityUseCase,
): UpdateAgentServiceIdentityController => useCase;

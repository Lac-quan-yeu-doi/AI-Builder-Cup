import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { AuthorizationGroup, CreateGroupInput } from '@/src/entities/models/administration';

export type CreateAuthorizationGroupUseCase = (
  input: CreateGroupInput,
) => Promise<AuthorizationGroup>;
export const createAuthorizationGroupUseCase =
  (repository: AdministrationRepository): CreateAuthorizationGroupUseCase =>
  (input): Promise<AuthorizationGroup> =>
    repository.createGroup({
      name: input.name.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    });

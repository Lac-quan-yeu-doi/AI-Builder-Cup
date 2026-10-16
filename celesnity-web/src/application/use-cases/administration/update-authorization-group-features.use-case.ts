import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type {
  AuthorizationGroup,
  UpdateGroupFeaturesInput,
} from '@/src/entities/models/administration';

export type UpdateAuthorizationGroupFeaturesUseCase = (
  input: UpdateGroupFeaturesInput,
) => Promise<AuthorizationGroup>;

export const createUpdateAuthorizationGroupFeaturesUseCase = (
  repository: AdministrationRepository,
): UpdateAuthorizationGroupFeaturesUseCase => repository.updateGroupFeatures.bind(repository);

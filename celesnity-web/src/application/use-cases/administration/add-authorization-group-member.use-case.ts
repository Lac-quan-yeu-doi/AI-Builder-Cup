import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { ChangeGroupMemberInput } from '@/src/entities/models/administration';

export type AddAuthorizationGroupMemberUseCase = (input: ChangeGroupMemberInput) => Promise<void>;
export const createAddAuthorizationGroupMemberUseCase = (
  repository: AdministrationRepository,
): AddAuthorizationGroupMemberUseCase => repository.addGroupMember.bind(repository);

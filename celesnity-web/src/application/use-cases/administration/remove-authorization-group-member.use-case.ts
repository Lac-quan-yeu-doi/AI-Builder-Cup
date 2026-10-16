import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { ChangeGroupMemberInput } from '@/src/entities/models/administration';

export type RemoveAuthorizationGroupMemberUseCase = (
  input: ChangeGroupMemberInput,
) => Promise<void>;
export const createRemoveAuthorizationGroupMemberUseCase = (
  repository: AdministrationRepository,
): RemoveAuthorizationGroupMemberUseCase => repository.removeGroupMember.bind(repository);

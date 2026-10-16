import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { OrganizationMember, UpdateMemberInput } from '@/src/entities/models/administration';

export type UpdateMemberUseCase = (input: UpdateMemberInput) => Promise<OrganizationMember>;
export const createUpdateMemberUseCase = (
  repository: AdministrationRepository,
): UpdateMemberUseCase => repository.updateMember.bind(repository);

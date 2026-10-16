import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { InviteMemberInput, MemberInvitation } from '@/src/entities/models/administration';

export type InviteMemberUseCase = (input: InviteMemberInput) => Promise<MemberInvitation>;
export const createInviteMemberUseCase =
  (repository: AdministrationRepository): InviteMemberUseCase =>
  (input): Promise<MemberInvitation> =>
    repository.inviteMember({ ...input, email: input.email.trim().toLowerCase() });

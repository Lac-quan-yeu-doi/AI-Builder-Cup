import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';

export interface CompletePasswordChangeInput {
  readonly code: string;
  readonly newPassword: string;
}

export type CompletePasswordChangeUseCase = (input: CompletePasswordChangeInput) => Promise<void>;

export const createCompletePasswordChangeUseCase =
  (repository: IdentitySessionRepository): CompletePasswordChangeUseCase =>
  (input) =>
    repository.completePasswordChange(input.code.replaceAll(/\s/gu, ''), input.newPassword);

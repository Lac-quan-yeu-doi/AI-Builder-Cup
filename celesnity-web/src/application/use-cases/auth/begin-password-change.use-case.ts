import type {
  BeginPasswordChangeResult,
  IdentitySessionRepository,
} from '@/src/application/repositories/identity-session.repository.interface';
import { PasswordChangeError } from '@/src/entities/errors/application-errors';

export interface BeginPasswordChangeInput {
  readonly email: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

export type BeginPasswordChangeUseCase = (
  input: BeginPasswordChangeInput,
) => Promise<BeginPasswordChangeResult>;

export const createBeginPasswordChangeUseCase =
  (repository: IdentitySessionRepository): BeginPasswordChangeUseCase =>
  async (input) => {
    if (input.newPassword !== input.confirmPassword)
      throw new PasswordChangeError('NEW_PASSWORD_MISMATCH');
    if (input.newPassword === input.currentPassword)
      throw new PasswordChangeError('NEW_PASSWORD_REUSED');
    if (input.newPassword.length < 12) throw new PasswordChangeError('NEW_PASSWORD_WEAK');
    return await repository.beginPasswordChange(
      input.email.trim().toLowerCase(),
      input.currentPassword,
      input.newPassword,
    );
  };

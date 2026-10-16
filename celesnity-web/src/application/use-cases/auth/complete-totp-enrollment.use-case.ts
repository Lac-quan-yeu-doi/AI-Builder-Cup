import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';

export type CompleteTotpEnrollmentUseCase = (code: string) => Promise<void>;
export const createCompleteTotpEnrollmentUseCase =
  (repository: IdentitySessionRepository): CompleteTotpEnrollmentUseCase =>
  (code) =>
    repository.completeTotpEnrollment(code.replaceAll(/\s/gu, ''));

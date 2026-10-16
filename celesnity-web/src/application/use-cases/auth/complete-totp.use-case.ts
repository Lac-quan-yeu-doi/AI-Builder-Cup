import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';

export type CompleteTotpUseCase = (code: string) => Promise<void>;
export const createCompleteTotpUseCase =
  (repository: IdentitySessionRepository): CompleteTotpUseCase =>
  (code) =>
    repository.completeTotp(code.replaceAll(/\s/gu, ''));

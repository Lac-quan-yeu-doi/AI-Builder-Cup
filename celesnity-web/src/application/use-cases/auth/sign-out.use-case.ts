import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';

export type SignOutUseCase = () => Promise<void>;

export const createSignOutUseCase =
  (repository: IdentitySessionRepository): SignOutUseCase =>
  () =>
    repository.signOut();

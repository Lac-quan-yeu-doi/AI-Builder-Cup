import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import type { AuthenticationMode } from '@/src/entities/models/session';

export type GetAuthenticationModeUseCase = () => Promise<AuthenticationMode>;

export const createGetAuthenticationModeUseCase =
  (repository: IdentitySessionRepository): GetAuthenticationModeUseCase =>
  () =>
    repository.authenticationMode();

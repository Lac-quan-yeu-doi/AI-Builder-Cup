import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import type { LocalDevelopmentPersona } from '@/src/entities/models/session';

export type SignInAsLocalPersonaUseCase = (persona: LocalDevelopmentPersona) => Promise<void>;

export const createSignInAsLocalPersonaUseCase =
  (repository: IdentitySessionRepository): SignInAsLocalPersonaUseCase =>
  (persona) =>
    repository.signInAsLocalPersona(persona);

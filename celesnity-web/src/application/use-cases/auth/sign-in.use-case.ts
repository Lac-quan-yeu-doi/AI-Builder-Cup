import type {
  IdentitySessionRepository,
  SignInResult,
} from '@/src/application/repositories/identity-session.repository.interface';

export type SignInUseCase = (
  organizationSlug: string,
  email: string,
  password: string,
) => Promise<SignInResult>;
export const createSignInUseCase =
  (repository: IdentitySessionRepository): SignInUseCase =>
  (organizationSlug, email, password) =>
    repository.signIn(organizationSlug.trim().toLowerCase(), email.trim().toLowerCase(), password);

import type { AuthenticatedContext } from './authenticated-context';
import type { VerifiedIdentityToken } from './identity-token.verifier';

export const IDENTITY_ACCESS_REPOSITORY = Symbol('IDENTITY_ACCESS_REPOSITORY');
export interface IdentityAccessRepository {
  resolve(token: VerifiedIdentityToken): Promise<AuthenticatedContext | undefined>;
  recordAuthenticationFailure(
    subject: string | undefined,
    tenantId: string | undefined,
    requestId: string | undefined,
  ): Promise<void>;
}

export const IDENTITY_TOKEN_VERIFIER = Symbol('IDENTITY_TOKEN_VERIFIER');

export interface VerifiedIdentityToken {
  readonly subject: string;
  readonly tenantId: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly emailVerified: boolean;
  readonly sessionId?: string;
  readonly authenticationTime: number;
  readonly mfaVerified: boolean;
}

export interface IdentityTokenVerifier {
  verify(token: string): Promise<VerifiedIdentityToken>;
}

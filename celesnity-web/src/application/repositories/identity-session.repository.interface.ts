export type SignInResult =
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'email-verification-required' }
  | { readonly kind: 'mfa-required' }
  | {
      readonly kind: 'mfa-enrollment-required';
      readonly qrCodeUrl: string;
      readonly secretKey: string;
    };

export type BeginPasswordChangeResult =
  { readonly kind: 'changed' } | { readonly kind: 'mfa-required' };

export interface IdentitySessionRepository {
  authenticationMode(): Promise<AuthenticationMode>;
  signInAsLocalPersona(persona: LocalDevelopmentPersona): Promise<void>;
  signIn(organizationSlug: string, email: string, password: string): Promise<SignInResult>;
  completeTotp(code: string): Promise<void>;
  completeTotpEnrollment(code: string): Promise<void>;
  beginPasswordChange(
    email: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<BeginPasswordChangeResult>;
  completePasswordChange(code: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
}
import type { AuthenticationMode, LocalDevelopmentPersona } from '@/src/entities/models/session';

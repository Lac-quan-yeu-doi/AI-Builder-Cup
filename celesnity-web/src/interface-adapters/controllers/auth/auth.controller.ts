import { z } from 'zod';

import type { CompleteTotpUseCase } from '@/src/application/use-cases/auth/complete-totp.use-case';
import type { CompleteTotpEnrollmentUseCase } from '@/src/application/use-cases/auth/complete-totp-enrollment.use-case';
import type { SignInUseCase } from '@/src/application/use-cases/auth/sign-in.use-case';
import type { SignOutUseCase } from '@/src/application/use-cases/auth/sign-out.use-case';
import type { BeginPasswordChangeUseCase } from '@/src/application/use-cases/auth/begin-password-change.use-case';
import type { CompletePasswordChangeUseCase } from '@/src/application/use-cases/auth/complete-password-change.use-case';
import type { GetAuthenticationModeUseCase } from '@/src/application/use-cases/auth/get-authentication-mode.use-case';
import type { SignInAsLocalPersonaUseCase } from '@/src/application/use-cases/auth/sign-in-as-local-persona.use-case';
import { LOCAL_DEVELOPMENT_PERSONAS } from '@/src/entities/models/session';

const credentialsSchema = z.object({
  organizationSlug: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/u),
  email: z.email(),
  password: z.string().min(1).max(1024),
});
const totpSchema = z.string().regex(/^\d{6}$/u);
const completePasswordChangeSchema = z.object({
  code: totpSchema,
  newPassword: z.string().min(12).max(1024),
});
const localPersonaSchema = z.enum(LOCAL_DEVELOPMENT_PERSONAS);
const passwordChangeSchema = z.object({
  email: z.email(),
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
  confirmPassword: z.string().min(1).max(1024),
});

export class AuthController {
  public constructor(
    private readonly signInUseCase: SignInUseCase,
    private readonly completeTotpUseCase: CompleteTotpUseCase,
    private readonly completeTotpEnrollmentUseCase: CompleteTotpEnrollmentUseCase,
    private readonly signOutUseCase: SignOutUseCase,
    private readonly beginPasswordChangeUseCase: BeginPasswordChangeUseCase,
    private readonly completePasswordChangeUseCase: CompletePasswordChangeUseCase,
    private readonly getAuthenticationModeUseCase: GetAuthenticationModeUseCase = async () =>
      'identity-platform',
    private readonly signInAsLocalPersonaUseCase: SignInAsLocalPersonaUseCase = async () => {
      throw new Error('Local development authentication is unavailable.');
    },
  ) {}
  public authenticationMode() {
    return this.getAuthenticationModeUseCase();
  }
  public signInAsLocalPersona(input: unknown) {
    return this.signInAsLocalPersonaUseCase(localPersonaSchema.parse(input));
  }
  public signIn(input: unknown) {
    const value = credentialsSchema.parse(input);
    return this.signInUseCase(value.organizationSlug, value.email, value.password);
  }
  public completeTotp(input: unknown) {
    return this.completeTotpUseCase(totpSchema.parse(input));
  }
  public completeTotpEnrollment(input: unknown) {
    return this.completeTotpEnrollmentUseCase(totpSchema.parse(input));
  }
  public signOut() {
    return this.signOutUseCase();
  }
  public beginPasswordChange(input: unknown) {
    return this.beginPasswordChangeUseCase(passwordChangeSchema.parse(input));
  }
  public completePasswordChange(input: unknown) {
    return this.completePasswordChangeUseCase(completePasswordChangeSchema.parse(input));
  }
}

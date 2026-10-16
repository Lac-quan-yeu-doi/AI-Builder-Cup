import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createCompleteTotpUseCase } from '@/src/application/use-cases/auth/complete-totp.use-case';
import { createCompleteTotpEnrollmentUseCase } from '@/src/application/use-cases/auth/complete-totp-enrollment.use-case';
import { createSignInUseCase } from '@/src/application/use-cases/auth/sign-in.use-case';
import { createSignOutUseCase } from '@/src/application/use-cases/auth/sign-out.use-case';
import { createBeginPasswordChangeUseCase } from '@/src/application/use-cases/auth/begin-password-change.use-case';
import { createCompletePasswordChangeUseCase } from '@/src/application/use-cases/auth/complete-password-change.use-case';
import { createGetAuthenticationModeUseCase } from '@/src/application/use-cases/auth/get-authentication-mode.use-case';
import { createSignInAsLocalPersonaUseCase } from '@/src/application/use-cases/auth/sign-in-as-local-persona.use-case';
import { FirebaseIdentitySessionRepository } from '@/src/infrastructure/auth/firebase-identity-session.repository';
import { AuthController } from '@/src/interface-adapters/controllers/auth/auth.controller';

export function createAuthModule() {
  const authModule = createTypedModule();
  authModule.bind(DI_SYMBOLS.AuthController).toFactory(() => {
    const repository = new FirebaseIdentitySessionRepository();
    return new AuthController(
      createSignInUseCase(repository),
      createCompleteTotpUseCase(repository),
      createCompleteTotpEnrollmentUseCase(repository),
      createSignOutUseCase(repository),
      createBeginPasswordChangeUseCase(repository),
      createCompletePasswordChangeUseCase(repository),
      createGetAuthenticationModeUseCase(repository),
      createSignInAsLocalPersonaUseCase(repository),
    );
  });
  return authModule;
}

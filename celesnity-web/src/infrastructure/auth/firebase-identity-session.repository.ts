import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getMultiFactorResolver,
  inMemoryPersistence,
  multiFactor,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updatePassword,
  type MultiFactorResolver,
  type Auth,
  type TotpSecret,
  type User,
} from 'firebase/auth';

import type {
  BeginPasswordChangeResult,
  IdentitySessionRepository,
  SignInResult,
} from '@/src/application/repositories/identity-session.repository.interface';
import { PasswordChangeError } from '@/src/entities/errors/application-errors';
import type { AuthenticationMode, LocalDevelopmentPersona } from '@/src/entities/models/session';

interface IdentityConfig {
  readonly mode: 'identity-platform';
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly mfaRequired: boolean;
  readonly organizationSlug?: string;
}

interface LocalDevelopmentConfig {
  readonly mode: 'local-development';
}

type AuthenticationConfig = IdentityConfig | LocalDevelopmentConfig;

export class FirebaseIdentitySessionRepository implements IdentitySessionRepository {
  private resolver?: MultiFactorResolver;
  private enrollment?: { readonly auth: Auth; readonly secret: TotpSecret; readonly user: User };
  private passwordChange?: {
    readonly auth: Auth;
    readonly resolver: MultiFactorResolver;
  };
  private activeOrganizationSlug?: string;

  public async authenticationMode(): Promise<AuthenticationMode> {
    return (await authenticationConfiguration()).mode;
  }

  public async signInAsLocalPersona(persona: LocalDevelopmentPersona): Promise<void> {
    const response = await fetch('/api/auth/local-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('The local development session could not be established.');
  }

  public async signIn(
    organizationSlug: string,
    email: string,
    password: string,
  ): Promise<SignInResult> {
    const configuration = await authenticationConfiguration(organizationSlug);
    if (configuration.mode !== 'identity-platform')
      throw new Error('Identity Platform is disabled.');
    const auth = await configuredAuth(configuration);
    this.activeOrganizationSlug = organizationSlug;
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        return { kind: 'email-verification-required' };
      }
      const enrolledTotp = multiFactor(credential.user).enrolledFactors.some(
        (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (configuration.mfaRequired !== false && !enrolledTotp) {
        const session = await multiFactor(credential.user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        this.enrollment = { auth, secret, user: credential.user };
        return {
          kind: 'mfa-enrollment-required',
          qrCodeUrl: secret.generateQrCodeUrl(
            credential.user.email ?? credential.user.uid,
            'Celesnity',
          ),
          secretKey: secret.secretKey,
        };
      }
      await establishServerSession(await credential.user.getIdToken(), organizationSlug);
      return { kind: 'authenticated' };
    } catch (error: unknown) {
      if (isMfaRequired(error)) {
        this.resolver = getMultiFactorResolver(auth, error);
        return { kind: 'mfa-required' };
      }
      throw error;
    }
  }

  public async completeTotp(code: string): Promise<void> {
    if (this.resolver === undefined) throw new Error('No MFA challenge is active.');
    const hint = this.resolver.hints.find(
      (candidate) => candidate.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (hint === undefined) throw new Error('This account does not have a TOTP factor.');
    const credential = await this.resolver.resolveSignIn(
      TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
    );
    this.resolver = undefined;
    if (this.activeOrganizationSlug === undefined) throw new Error('Organization is missing.');
    await establishServerSession(await credential.user.getIdToken(), this.activeOrganizationSlug);
  }

  public async completeTotpEnrollment(code: string): Promise<void> {
    if (this.enrollment === undefined) throw new Error('No MFA enrollment is active.');
    const { auth, secret, user } = this.enrollment;
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
    await multiFactor(user).enroll(assertion, 'Celesnity Authenticator');
    this.enrollment = undefined;
    await signOut(auth);
  }

  public async beginPasswordChange(
    email: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<BeginPasswordChangeResult> {
    const auth = await configuredAuth();
    this.passwordChange = undefined;
    this.activeOrganizationSlug = undefined;
    try {
      const credential = await signInWithEmailAndPassword(auth, email, currentPassword);
      await updatePassword(credential.user, newPassword);
      await endServerSession(auth);
      return { kind: 'changed' };
    } catch (error) {
      if (isMfaRequired(error)) {
        this.passwordChange = {
          auth,
          resolver: getMultiFactorResolver(auth, error),
        };
        return { kind: 'mfa-required' };
      }
      throw translatePasswordChangeError(error);
    }
  }

  public async completePasswordChange(code: string, newPassword: string): Promise<void> {
    if (this.passwordChange === undefined)
      throw new PasswordChangeError('NO_PASSWORD_CHANGE_ACTIVE');
    const { auth, resolver } = this.passwordChange;
    const hint = resolver.hints.find(
      (candidate) => candidate.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (hint === undefined) throw new Error('This account does not have a TOTP factor.');
    try {
      const credential = await resolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
      );
      await updatePassword(credential.user, newPassword);
      this.passwordChange = undefined;
      await endServerSession(auth);
    } catch (error) {
      throw translatePasswordChangeError(error);
    }
  }

  public async signOut(): Promise<void> {
    const configuration = await authenticationConfiguration();
    this.enrollment = undefined;
    this.resolver = undefined;
    this.passwordChange = undefined;
    if (configuration.mode === 'local-development') {
      await endServerSessionOnly();
      return;
    }
    const auth = await configuredAuth(configuration);
    await endServerSession(auth);
  }
}

async function endServerSession(auth: Auth): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('The secure server session could not be ended.');
  await signOut(auth);
}

async function configuredAuth(configuration?: IdentityConfig) {
  const config = configuration ?? (await authenticationConfiguration());
  if (config.mode !== 'identity-platform') {
    throw new Error('Identity Platform authentication is disabled in local development mode.');
  }
  const app = getApps().length === 0 ? initializeApp(config) : getApp();
  const auth = getAuth(app);
  auth.tenantId = config.tenantId;
  await setPersistence(auth, inMemoryPersistence);
  // Explicitly avoid localStorage/IndexedDB persistence. The HTTP-only server
  // cookie is the durable session; Firebase remains memory-only.
  return auth;
}

async function authenticationConfiguration(
  organizationSlug?: string,
): Promise<AuthenticationConfig> {
  const query =
    organizationSlug === undefined ? '' : `?organization=${encodeURIComponent(organizationSlug)}`;
  const response = await fetch(`/api/auth/config${query}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Identity configuration is unavailable.');
  return (await response.json()) as AuthenticationConfig;
}

async function establishServerSession(idToken: string, organizationSlug: string): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, organizationSlug }),
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('The secure server session could not be established.');
}

async function endServerSessionOnly(): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('The secure server session could not be ended.');
}

function isMfaRequired(error: unknown): error is Parameters<typeof getMultiFactorResolver>[1] {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'auth/multi-factor-auth-required'
  );
}

function translatePasswordChangeError(error: unknown): unknown {
  const code = firebaseErrorCode(error);
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-mismatch' ||
    code === 'auth/user-not-found'
  )
    return new PasswordChangeError('CURRENT_PASSWORD_INVALID');
  if (code === 'auth/weak-password') return new PasswordChangeError('NEW_PASSWORD_WEAK');
  return error;
}

function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function csrfHeaders(): HeadersInit {
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('celesnity_csrf='))
    ?.split('=', 2)[1];
  return value === undefined ? {} : { 'X-CSRF-Token': decodeURIComponent(value) };
}

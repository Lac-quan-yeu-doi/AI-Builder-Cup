// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseSignOut = vi.hoisted(() => vi.fn(async () => undefined));
const firebaseSignIn = vi.hoisted(() => vi.fn());
const firebaseUpdatePassword = vi.hoisted(() => vi.fn(async () => undefined));
const resolveSignIn = vi.hoisted(() => vi.fn());
const resolver = vi.hoisted(() => ({
  hints: [{ factorId: 'totp', uid: 'totp-factor' }],
  resolveSignIn,
}));
const getResolver = vi.hoisted(() => vi.fn(() => resolver));
const auth = vi.hoisted(() => ({ tenantId: null as string | null }));
const factors = vi.hoisted(() => ({
  enrolledFactors: [] as { factorId: string }[],
  getSession: vi.fn(async () => 'enrollment-session'),
}));
const generateSecret = vi.hoisted(() =>
  vi.fn(async () => ({ secretKey: 'SECRET', generateQrCodeUrl: () => 'otpauth://totp/test' })),
);

vi.mock('firebase/app', () => ({
  getApp: () => ({}),
  getApps: () => [],
  initializeApp: () => ({}),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => auth,
  getMultiFactorResolver: getResolver,
  inMemoryPersistence: {},
  multiFactor: () => factors,
  sendEmailVerification: vi.fn(),
  setPersistence: vi.fn(async () => undefined),
  signInWithEmailAndPassword: firebaseSignIn,
  signOut: firebaseSignOut,
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret,
    assertionForSignIn: vi.fn((uid: string, code: string) => ({ uid, code })),
  },
  updatePassword: firebaseUpdatePassword,
}));

import { FirebaseIdentitySessionRepository } from '@/src/infrastructure/auth/firebase-identity-session.repository';

const identityConfig = {
  mfaRequired: true,
  mode: 'identity-platform',
  apiKey: 'api-key',
  authDomain: 'identity.example.test',
  projectId: 'project',
  tenantId: 'tenant',
};

describe('organization MFA sign-in policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    factors.enrolledFactors = [];
    firebaseSignIn.mockResolvedValue({
      user: {
        uid: 'user-1',
        email: 'member@example.test',
        emailVerified: true,
        getIdToken: async () => 'id-token',
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs in an unenrolled member without enrollment when MFA is off', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...identityConfig, mfaRequired: false }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      new FirebaseIdentitySessionRepository().signIn('test-org', 'member@example.test', 'password'),
    ).resolves.toEqual({ kind: 'authenticated' });
    expect(generateSecret).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/auth/session',
      expect.objectContaining({ method: 'POST' }),
    );
  });
  it('requires TOTP enrollment for an unenrolled member after opt-in', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(identityConfig));
    vi.stubGlobal('fetch', fetch);
    await expect(
      new FirebaseIdentitySessionRepository().signIn('test-org', 'member@example.test', 'password'),
    ).resolves.toEqual({
      kind: 'mfa-enrollment-required',
      secretKey: 'SECRET',
      qrCodeUrl: 'otpauth://totp/test',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(generateSecret).toHaveBeenCalledWith('enrollment-session');
  });
  it('retains Firebase MFA challenges for already-enrolled members', async () => {
    firebaseSignIn.mockRejectedValue({ code: 'auth/multi-factor-auth-required' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(identityConfig)));
    await expect(
      new FirebaseIdentitySessionRepository().signIn('test-org', 'member@example.test', 'password'),
    ).resolves.toEqual({ kind: 'mfa-required' });
    expect(generateSecret).not.toHaveBeenCalled();
  });
});

describe('FirebaseIdentitySessionRepository sign out', () => {
  beforeEach(() => {
    document.cookie = 'celesnity_csrf=csrf-value; path=/';
    auth.tenantId = null;
    firebaseSignOut.mockClear();
    firebaseSignIn.mockReset();
    firebaseUpdatePassword.mockReset();
    firebaseUpdatePassword.mockResolvedValue(undefined);
    resolveSignIn.mockReset();
    getResolver.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ends the server session with CSRF protection before clearing Firebase state', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(identityConfig))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(new FirebaseIdentitySessionRepository().signOut()).resolves.toBeUndefined();

    expect(auth.tenantId).toBe('tenant');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/session', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-value' },
      credentials: 'include',
    });
    expect(firebaseSignOut).toHaveBeenCalledWith(auth);
  });

  it('does not report success or clear Firebase state when the server session remains active', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(identityConfig))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);

    await expect(new FirebaseIdentitySessionRepository().signOut()).rejects.toThrow(
      'The secure server session could not be ended.',
    );
    expect(firebaseSignOut).not.toHaveBeenCalled();
  });

  it('creates and ends a local persona session without initializing Firebase', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ mode: 'local-development' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ mode: 'local-development' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const repository = new FirebaseIdentitySessionRepository();

    await expect(repository.authenticationMode()).resolves.toBe('local-development');
    await expect(repository.signInAsLocalPersona('local-viewer')).resolves.toBeUndefined();
    await expect(repository.signOut()).resolves.toBeUndefined();

    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/local-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: 'local-viewer' }),
      credentials: 'same-origin',
    });
    expect(firebaseSignOut).not.toHaveBeenCalled();
  });
});

describe('FirebaseIdentitySessionRepository password change', () => {
  beforeEach(() => {
    document.cookie = 'celesnity_csrf=csrf-value; path=/';
    auth.tenantId = null;
    firebaseSignOut.mockClear();
    firebaseSignIn.mockReset();
    firebaseUpdatePassword.mockReset();
    firebaseUpdatePassword.mockResolvedValue(undefined);
    resolveSignIn.mockReset();
    getResolver.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reauthenticates, changes the password, and ends the session', async () => {
    const user = { uid: 'user-id' };
    firebaseSignIn.mockResolvedValue({ user });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(identityConfig))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      new FirebaseIdentitySessionRepository().beginPasswordChange(
        'user@example.com',
        'current-password',
        'new-password-value',
      ),
    ).resolves.toEqual({ kind: 'changed' });

    expect(firebaseSignIn).toHaveBeenCalledWith(auth, 'user@example.com', 'current-password');
    expect(firebaseUpdatePassword).toHaveBeenCalledWith(user, 'new-password-value');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/session', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-value' },
      credentials: 'include',
    });
    expect(firebaseSignOut).toHaveBeenCalledWith(auth);
  });

  it('requires TOTP before changing the password for an MFA account', async () => {
    const user = { uid: 'user-id' };
    const mfaRequired = { code: 'auth/multi-factor-auth-required' };
    firebaseSignIn.mockRejectedValue(mfaRequired);
    resolveSignIn.mockResolvedValue({ user });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(identityConfig))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const repository = new FirebaseIdentitySessionRepository();

    await expect(
      repository.beginPasswordChange('user@example.com', 'current-password', 'new-password-value'),
    ).resolves.toEqual({ kind: 'mfa-required' });
    expect(getResolver).toHaveBeenCalledWith(auth, mfaRequired);
    expect(firebaseUpdatePassword).not.toHaveBeenCalled();

    await expect(
      repository.completePasswordChange('123456', 'new-password-value'),
    ).resolves.toBeUndefined();
    expect(resolveSignIn).toHaveBeenCalledWith({ uid: 'totp-factor', code: '123456' });
    expect(firebaseUpdatePassword).toHaveBeenCalledWith(user, 'new-password-value');
    expect(firebaseSignOut).toHaveBeenCalledWith(auth);
  });

  it('maps an invalid current password to an application error', async () => {
    firebaseSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(identityConfig)));

    await expect(
      new FirebaseIdentitySessionRepository().beginPasswordChange(
        'user@example.com',
        'wrong-password',
        'new-password-value',
      ),
    ).rejects.toMatchObject({ reason: 'CURRENT_PASSWORD_INVALID' });
    expect(firebaseUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejects a TOTP completion that has no active password change', async () => {
    await expect(
      new FirebaseIdentitySessionRepository().completePasswordChange(
        '123456',
        'new-password-value',
      ),
    ).rejects.toMatchObject({ reason: 'NO_PASSWORD_CHANGE_ACTIVE' });
  });
});

import { describe, expect, it, vi } from 'vitest';

import { AuthController } from '@/src/interface-adapters/controllers/auth/auth.controller';

describe('AuthController', () => {
  it('validates and forwards local development persona authentication', async () => {
    const mode = vi.fn(async () => 'local-development' as const);
    const localSignIn = vi.fn(async () => undefined);
    const controller = new AuthController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      mode,
      localSignIn,
    );

    await expect(controller.authenticationMode()).resolves.toBe('local-development');
    await expect(controller.signInAsLocalPersona('local-analyst')).resolves.toBeUndefined();
    expect(localSignIn).toHaveBeenCalledWith('local-analyst');
    expect(() => controller.signInAsLocalPersona('platform-admin')).toThrow();
  });

  it('normalizes validated credentials through the use case', async () => {
    const signIn = vi.fn(async () => ({ kind: 'authenticated' as const }));
    const controller = new AuthController(signIn, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    await expect(
      controller.signIn({
        organizationSlug: 'test-org',
        email: 'User@Example.com',
        password: 'secret',
      }),
    ).resolves.toEqual({ kind: 'authenticated' });
    expect(signIn).toHaveBeenCalledWith('test-org', 'User@Example.com', 'secret');
  });

  it('rejects malformed credentials and non-six-digit TOTP before infrastructure', async () => {
    const signIn = vi.fn();
    const completeTotp = vi.fn();
    const completeTotpEnrollment = vi.fn();
    const controller = new AuthController(
      signIn,
      completeTotp,
      completeTotpEnrollment,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    expect(() => controller.signIn({ email: 'not-email', password: '' })).toThrow();
    expect(() => controller.completeTotp('12345')).toThrow();
    expect(() => controller.completeTotpEnrollment('abcdef')).toThrow();
    expect(signIn).not.toHaveBeenCalled();
    expect(completeTotp).not.toHaveBeenCalled();
    expect(completeTotpEnrollment).not.toHaveBeenCalled();
  });

  it('validates and forwards a TOTP enrollment code', async () => {
    const completeTotpEnrollment = vi.fn(async () => undefined);
    const controller = new AuthController(
      vi.fn(),
      vi.fn(),
      completeTotpEnrollment,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    await expect(controller.completeTotpEnrollment('123456')).resolves.toBeUndefined();
    expect(completeTotpEnrollment).toHaveBeenCalledWith('123456');
  });

  it('forwards sign out to its use case', async () => {
    const signOut = vi.fn(async () => undefined);
    const controller = new AuthController(vi.fn(), vi.fn(), vi.fn(), signOut, vi.fn(), vi.fn());

    await expect(controller.signOut()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('validates and forwards password-change requests', async () => {
    const begin = vi.fn(async () => ({ kind: 'mfa-required' as const }));
    const complete = vi.fn(async () => undefined);
    const controller = new AuthController(vi.fn(), vi.fn(), vi.fn(), vi.fn(), begin, complete);

    await expect(
      controller.beginPasswordChange({
        email: 'user@example.com',
        currentPassword: 'current-password',
        newPassword: 'new-password-value',
        confirmPassword: 'new-password-value',
      }),
    ).resolves.toEqual({ kind: 'mfa-required' });
    await expect(
      controller.completePasswordChange({ code: '123456', newPassword: 'new-password-value' }),
    ).resolves.toBeUndefined();

    expect(begin).toHaveBeenCalledWith({
      email: 'user@example.com',
      currentPassword: 'current-password',
      newPassword: 'new-password-value',
      confirmPassword: 'new-password-value',
    });
    expect(complete).toHaveBeenCalledWith({
      code: '123456',
      newPassword: 'new-password-value',
    });
  });

  it('rejects an invalid password-change completion before its use case', () => {
    const complete = vi.fn();
    const controller = new AuthController(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), complete);

    expect(() =>
      controller.completePasswordChange({ code: '12345', newPassword: 'too-short' }),
    ).toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
});

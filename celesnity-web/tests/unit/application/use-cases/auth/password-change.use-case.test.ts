import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import { createBeginPasswordChangeUseCase } from '@/src/application/use-cases/auth/begin-password-change.use-case';
import { createCompletePasswordChangeUseCase } from '@/src/application/use-cases/auth/complete-password-change.use-case';

function repository(): IdentitySessionRepository {
  return {
    authenticationMode: vi.fn(async () => 'identity-platform' as const),
    signInAsLocalPersona: vi.fn(),
    signIn: vi.fn(),
    completeTotp: vi.fn(),
    completeTotpEnrollment: vi.fn(),
    beginPasswordChange: vi.fn(async () => ({ kind: 'mfa-required' as const })),
    completePasswordChange: vi.fn(async () => undefined),
    signOut: vi.fn(),
  };
}

describe('password change use cases', () => {
  it('normalizes the email and begins reauthentication', async () => {
    const identity = repository();
    const begin = createBeginPasswordChangeUseCase(identity);

    await expect(
      begin({
        email: ' User@Example.COM ',
        currentPassword: 'current-password',
        newPassword: 'new-password-value',
        confirmPassword: 'new-password-value',
      }),
    ).resolves.toEqual({ kind: 'mfa-required' });
    expect(identity.beginPasswordChange).toHaveBeenCalledWith(
      'user@example.com',
      'current-password',
      'new-password-value',
    );
  });

  it.each([
    {
      currentPassword: 'current-password',
      newPassword: 'new-password-value',
      confirmPassword: 'different-value',
      reason: 'NEW_PASSWORD_MISMATCH' as const,
    },
    {
      currentPassword: 'same-password',
      newPassword: 'same-password',
      confirmPassword: 'same-password',
      reason: 'NEW_PASSWORD_REUSED' as const,
    },
    {
      currentPassword: 'current-password',
      newPassword: 'short',
      confirmPassword: 'short',
      reason: 'NEW_PASSWORD_WEAK' as const,
    },
  ])('rejects $reason without calling Firebase', async (example) => {
    const identity = repository();
    const begin = createBeginPasswordChangeUseCase(identity);

    await expect(begin({ email: 'user@example.com', ...example })).rejects.toMatchObject({
      reason: example.reason,
    });
    expect(identity.beginPasswordChange).not.toHaveBeenCalled();
  });

  it('normalizes the TOTP code and forwards the new password', async () => {
    const identity = repository();

    await createCompletePasswordChangeUseCase(identity)({
      code: '12 34 56',
      newPassword: 'new-password-value',
    });

    expect(identity.completePasswordChange).toHaveBeenCalledWith('123456', 'new-password-value');
  });
});

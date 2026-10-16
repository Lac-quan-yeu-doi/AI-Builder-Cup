import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { verifySessionCookie, policy } = vi.hoisted(() => ({
  verifySessionCookie: vi.fn(),
  policy: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/src/infrastructure/auth/firebase-admin-auth', () => ({
  tenantAuthForToken: () => ({ verifySessionCookie }),
  unverifiedTenantId: () => 'tenant-a',
}));
vi.mock('@/src/infrastructure/auth/organization-mfa-policy', () => ({
  organizationMfaRequired: policy,
}));
vi.mock('@/src/infrastructure/auth/local-development-session', () => ({
  verifyLocalDevelopmentSession: vi.fn(),
}));
import { verifyServerSessionSubject } from '@/src/infrastructure/auth/server-session-subject';

describe('Agent session MFA enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('CELESNITY_AUTH_MODE', 'identity-platform');
    vi.resetAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rechecks policy and denies an existing password-only cookie after opt-in', async () => {
    verifySessionCookie.mockResolvedValue({ sub: 'user-1', firebase: {} });
    policy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await verifyServerSessionSubject('cookie')).toBe('user-1');
    await expect(verifyServerSessionSubject('cookie')).rejects.toThrow(
      'Multi-factor authentication is required',
    );
    expect(verifySessionCookie).toHaveBeenCalledWith('cookie', true);
  });
  it('accepts a TOTP session under the enabled policy', async () => {
    verifySessionCookie.mockResolvedValue({
      sub: 'user-1',
      firebase: { sign_in_second_factor: 'totp' },
    });
    policy.mockResolvedValue(true);
    expect(await verifyServerSessionSubject('cookie')).toBe('user-1');
  });
  it('does not grant access when policy lookup fails', async () => {
    verifySessionCookie.mockResolvedValue({ sub: 'user-1', firebase: {} });
    policy.mockRejectedValue(new Error('Unavailable'));
    await expect(verifyServerSessionSubject('cookie')).rejects.toThrow('Unavailable');
  });
});

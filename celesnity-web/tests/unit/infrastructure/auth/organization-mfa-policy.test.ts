import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/src/infrastructure/auth/firebase-admin-auth', () => ({
  requiredEnvironment: (name: string) =>
    name === 'CORE_API_URL' ? 'https://core.test/api/v1/' : 'tenant/a',
}));
import { organizationMfaRequired } from '@/src/infrastructure/auth/organization-mfa-policy';

afterEach(() => vi.unstubAllGlobals());
describe('organization MFA policy', () => {
  it('fetches fresh policy for the server-configured tenant on every call', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ mfaRequired: false }))
      .mockResolvedValueOnce(Response.json({ mfaRequired: true }));
    vi.stubGlobal('fetch', fetch);
    expect(await organizationMfaRequired('tenant/a')).toBe(false);
    expect(await organizationMfaRequired('tenant/a')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      'https://core.test/api/v1/administration/mfa-policy/tenant%2Fa',
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
  });
  it.each([{}, null, { mfaRequired: 'false' }, { mfaRequired: 0 }])(
    'rejects malformed policy %j',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
      await expect(organizationMfaRequired('tenant/a')).rejects.toThrow(
        'Invalid organization security policy',
      );
    },
  );
  it('fails closed on an unavailable policy endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(organizationMfaRequired('tenant/a')).rejects.toThrow(
      'Organization security policy is unavailable',
    );
  });
});

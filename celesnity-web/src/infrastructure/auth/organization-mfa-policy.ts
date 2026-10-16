import 'server-only';

import { requiredEnvironment } from '@/src/infrastructure/auth/firebase-admin-auth';

/** Never cache security policy or treat an unavailable policy as MFA disabled. */
export async function organizationMfaRequired(identityTenantId: string): Promise<boolean> {
  const base = requiredEnvironment('CORE_API_URL').replace(/\/+$/u, '');
  const response = await fetch(
    `${base}/administration/mfa-policy/${encodeURIComponent(identityTenantId)}`,
    {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error('Organization security policy is unavailable.');
  const policy: unknown = await response.json();
  if (
    typeof policy !== 'object' ||
    policy === null ||
    !('mfaRequired' in policy) ||
    typeof policy.mfaRequired !== 'boolean'
  ) {
    throw new Error('Invalid organization security policy.');
  }
  return policy.mfaRequired;
}

export async function organizationLoginContext(
  organizationSlug: string,
): Promise<{ identityTenantId: string; mfaRequired: boolean }> {
  const base = requiredEnvironment('CORE_API_URL').replace(/\/+$/u, '');
  const response = await fetch(
    `${base}/administration/login-context/${encodeURIComponent(organizationSlug)}`,
    { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error('Organization login context is unavailable.');
  const context: unknown = await response.json();
  if (
    typeof context !== 'object' ||
    context === null ||
    !('identityTenantId' in context) ||
    typeof context.identityTenantId !== 'string' ||
    !('mfaRequired' in context) ||
    typeof context.mfaRequired !== 'boolean'
  ) {
    throw new Error('Invalid organization login context.');
  }
  return { identityTenantId: context.identityTenantId, mfaRequired: context.mfaRequired };
}

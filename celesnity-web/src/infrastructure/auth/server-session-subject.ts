import 'server-only';

import {
  tenantAuthForToken,
  unverifiedTenantId,
} from '@/src/infrastructure/auth/firebase-admin-auth';
import { verifyLocalDevelopmentSession } from '@/src/infrastructure/auth/local-development-session';
import { organizationMfaRequired } from '@/src/infrastructure/auth/organization-mfa-policy';

export async function verifyServerSessionSubject(session: string): Promise<string> {
  if (process.env.CELESNITY_AUTH_MODE === 'local-development') {
    return verifyLocalDevelopmentSession(session);
  }
  const tenantId = unverifiedTenantId(session);
  const decoded = await tenantAuthForToken(session).verifySessionCookie(session, true);
  if (
    (await organizationMfaRequired(tenantId)) &&
    decoded.firebase?.sign_in_second_factor !== 'totp'
  ) {
    throw new Error('Multi-factor authentication is required.');
  }
  if (decoded.sub === '') throw new Error('Session subject is missing.');
  return decoded.sub;
}

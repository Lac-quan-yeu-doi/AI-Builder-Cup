import 'server-only';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function tenantAuth(tenantId: string) {
  const projectId = requiredEnvironment('IDENTITY_PLATFORM_PROJECT_ID');
  const existing = getApps().find((app) => app.options.projectId === projectId);
  const app = existing ?? initializeApp({ credential: applicationDefault(), projectId });
  return getAuth(app).tenantManager().authForTenant(tenantId);
}

export function tenantAuthForToken(token: string) {
  return tenantAuth(unverifiedTenantId(token));
}

export function unverifiedTenantId(token: string): string {
  if (Buffer.byteLength(token, 'utf8') > 16_384) throw new Error('Identity token is invalid.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) throw new Error('Identity token is invalid.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
    firebase?: { tenant?: unknown };
  };
  const tenantId = payload.firebase?.tenant;
  if (typeof tenantId !== 'string' || tenantId.length === 0 || tenantId.length > 128) {
    throw new Error('Identity token tenant is missing.');
  }
  return tenantId;
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

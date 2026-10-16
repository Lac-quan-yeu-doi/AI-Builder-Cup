import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { CSRF_COOKIE, SESSION_COOKIE } from '@/src/entities/models/session';

const verifyIdToken = vi.fn();
const createSessionCookie = vi.fn();
const verifySessionCookie = vi.fn();
const revokeRefreshTokens = vi.fn();
const organizationLoginContext = vi.hoisted(() => vi.fn());

vi.mock('@/di/server-auth', () => ({
  organizationLoginContext,
  tenantAuth: () => ({
    createSessionCookie,
    revokeRefreshTokens,
    verifyIdToken,
    verifySessionCookie,
  }),
  tenantAuthForToken: () => ({ verifySessionCookie, revokeRefreshTokens }),
}));

import { DELETE, POST } from '@/app/api/auth/session/route';

function request() {
  return new NextRequest('http://localhost:3000/api/auth/session', {
    body: JSON.stringify({ idToken: 'identity-token', organizationSlug: 'test-org' }),
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    method: 'POST',
  });
}

function deleteRequest() {
  return new NextRequest('https://dev.celesnity.com/api/auth/session', {
    headers: {
      Cookie: '__Host-celesnity_session=session-cookie; celesnity_csrf=csrf-value',
      Origin: 'https://dev.celesnity.com',
      'X-CSRF-Token': 'csrf-value',
    },
    method: 'DELETE',
  });
}

describe('authentication session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationLoginContext.mockResolvedValue({ identityTenantId: 'tenant-a', mfaRequired: true });
    process.env.WEB_ORIGIN = 'http://localhost:3000,https://dev.celesnity.com';
    createSessionCookie.mockResolvedValue('session-cookie');
    verifySessionCookie.mockResolvedValue({ sub: 'identity-subject' });
    revokeRefreshTokens.mockResolvedValue(undefined);
  });

  it('rejects an unverified email before creating a session cookie', async () => {
    verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: false,
      firebase: { sign_in_second_factor: 'totp' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('rejects a password-only identity token', async () => {
    verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: true,
      firebase: {},
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('accepts a verified password-only token while organization MFA is off', async () => {
    organizationLoginContext.mockResolvedValue({
      identityTenantId: 'tenant-a',
      mfaRequired: false,
    });
    verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: true,
      firebase: {},
    });
    expect((await POST(request())).status).toBe(204);
    expect(createSessionCookie).toHaveBeenCalled();
  });

  it('fails closed when the organization policy is unavailable', async () => {
    organizationLoginContext.mockRejectedValue(new Error('Core unavailable'));
    verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: true,
      firebase: {},
    });
    expect((await POST(request())).status).toBe(503);
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('returns unauthorized when Firebase rejects the identity token', async () => {
    verifyIdToken.mockRejectedValue(
      Object.assign(new Error('Firebase ID token has an unknown key.'), {
        code: 'auth/argument-error',
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Identity token is invalid or expired.',
    });
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('returns service unavailable when the identity provider cannot be resolved', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    verifyIdToken.mockRejectedValue(
      Object.assign(new Error('getaddrinfo EAI_AGAIN www.googleapis.com'), {
        code: 'auth/argument-error',
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Identity service is temporarily unavailable.',
    });
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'identity_provider_unavailable',
        errorCode: 'auth/argument-error',
      }),
    );
    expect(createSessionCookie).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns service unavailable when the runtime identity lacks tenant permission', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    verifyIdToken.mockRejectedValue(
      Object.assign(new Error('Credential has insufficient permission.'), {
        code: 'auth/insufficient-permission',
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Identity service is temporarily unavailable.',
    });
    expect(createSessionCookie).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('creates a session only for a recent verified TOTP-authenticated token', async () => {
    verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: true,
      firebase: { sign_in_second_factor: 'totp' },
    });

    const response = await POST(request());

    expect(response.status).toBe(204);
    expect(createSessionCookie).toHaveBeenCalledWith('identity-token', expect.any(Object));
  });

  it('expires every authentication cookie with attributes accepted for __Host cookies', async () => {
    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(204);
    expect(verifySessionCookie).toHaveBeenCalledWith('session-cookie', true);
    expect(revokeRefreshTokens).toHaveBeenCalledWith('identity-subject');

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie).toBeDefined();
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=strict');
    }
    expect(cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`))).toContain('HttpOnly');
  });
});

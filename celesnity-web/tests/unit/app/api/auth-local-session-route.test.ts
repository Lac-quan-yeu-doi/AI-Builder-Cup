import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createLocalDevelopmentSession = vi.hoisted(() => vi.fn());

vi.mock('@/di/server-auth', () => ({ createLocalDevelopmentSession }));

import { GET, POST } from '@/app/api/auth/local-session/route';

describe('local development session route', () => {
  beforeEach(() => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    createLocalDevelopmentSession.mockReset();
    createLocalDevelopmentSession.mockReturnValue('signed-local-session');
  });

  it('creates HTTP-only session and CSRF cookies for a known persona', async () => {
    const response = await POST(request({ persona: 'local-analyst' }));

    expect(response.status).toBe(204);
    expect(createLocalDevelopmentSession).toHaveBeenCalledWith('local-analyst');
    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('__Host-celesnity_session=signed-local-session');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('celesnity_csrf=');
  });

  it('rejects unknown personas before signing', async () => {
    const response = await POST(request({ persona: 'local-platform-admin' }));
    expect(response.status).toBe(400);
    expect(createLocalDevelopmentSession).not.toHaveBeenCalled();
  });

  it('rejects cross-origin requests', async () => {
    const response = await POST(request({ persona: 'local-owner' }, 'https://attacker.test'));
    expect(response.status).toBe(403);
    expect(createLocalDevelopmentSession).not.toHaveBeenCalled();
  });
});

describe('local development automatic sign-in', () => {
  beforeEach(() => {
    createLocalDevelopmentSession.mockReset();
    createLocalDevelopmentSession.mockReturnValue('signed-local-session');
  });

  it('signs in as the owner and returns to the requested page', () => {
    const response = GET(autoSignIn('/plant-model?tab=repairs'));

    expect(createLocalDevelopmentSession).toHaveBeenCalledWith('local-owner');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/plant-model?tab=repairs');
    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('=signed-local-session');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('celesnity_csrf=');
  });

  it.each(['https://attacker.test/', '//attacker.test/', '/\\attacker.test', '/login'])(
    'sends %s home instead of following it',
    (returnTo) => {
      const response = GET(autoSignIn(returnTo));
      expect(response.headers.get('location')).toBe('/');
    },
  );

  it('answers with an error instead of redirecting when local sign-in is disabled', () => {
    createLocalDevelopmentSession.mockImplementation(() => {
      throw new Error('Local development authentication is disabled.');
    });

    const response = GET(autoSignIn('/chat'));

    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
  });
});

function autoSignIn(returnTo: string) {
  const url = new URL('http://localhost:3000/api/auth/local-session');
  url.searchParams.set('returnTo', returnTo);
  return new NextRequest(url);
}

function request(body: object, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/auth/local-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

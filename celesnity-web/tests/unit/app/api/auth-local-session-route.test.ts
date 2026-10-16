import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createLocalDevelopmentSession = vi.hoisted(() => vi.fn());

vi.mock('@/di/server-auth', () => ({ createLocalDevelopmentSession }));

import { POST } from '@/app/api/auth/local-session/route';

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

function request(body: object, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/auth/local-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

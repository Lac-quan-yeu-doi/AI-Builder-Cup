import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyServerSessionSubject,
  loadWorkspaceAccess,
  extractPlantWalkthrough,
  isGeminiConfigured,
} = vi.hoisted(() => ({
  verifyServerSessionSubject: vi.fn().mockResolvedValue('subject'),
  loadWorkspaceAccess: vi.fn().mockResolvedValue(['PLANT_MODEL']),
  extractPlantWalkthrough: vi.fn(),
  isGeminiConfigured: vi.fn().mockReturnValue(true),
}));
vi.mock('@/di/server-auth', () => ({ verifyServerSessionSubject, loadWorkspaceAccess }));
vi.mock('@/di/server-plant-walkthrough', () => ({
  extractPlantWalkthrough,
  isGeminiConfigured,
  WalkthroughExtractionError: class WalkthroughExtractionError extends Error {},
}));

import { POST } from '@/app/api/plant-walkthroughs/route';
import { sessionCookieName } from '@/src/entities/models/session';

const ORIGIN = 'http://localhost:3000';

function request(options: { csrf?: string; body?: FormData; session?: boolean } = {}) {
  const body = options.body ?? withVideo();
  const cookies = [`celesnity_csrf=token`];
  if (options.session !== false) cookies.push(`${sessionCookieName()}=session`);
  return new NextRequest(`${ORIGIN}/api/plant-walkthroughs`, {
    method: 'POST',
    body,
    headers: {
      cookie: cookies.join('; '),
      origin: ORIGIN,
      'x-csrf-token': options.csrf ?? 'token',
    },
  });
}

function withVideo(type = 'video/mp4') {
  const form = new FormData();
  form.set('video', new File(['x'], 'walk.mp4', { type }));
  return form;
}

describe('plant walkthrough route', () => {
  beforeEach(() => {
    process.env.WEB_ORIGIN = ORIGIN;
    extractPlantWalkthrough.mockReset();
    loadWorkspaceAccess.mockResolvedValue(['PLANT_MODEL']);
    isGeminiConfigured.mockReturnValue(true);
  });

  it('needs a session', async () => {
    expect((await POST(request({ session: false }))).status).toBe(401);
  });

  it('rejects a request without the CSRF token', async () => {
    expect((await POST(request({ csrf: 'other' }))).status).toBe(403);
    expect(extractPlantWalkthrough).not.toHaveBeenCalled();
  });

  it('needs the plant model feature', async () => {
    loadWorkspaceAccess.mockResolvedValue(['CHAT']);
    expect((await POST(request())).status).toBe(403);
  });

  it('says when Gemini is not configured', async () => {
    isGeminiConfigured.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'GEMINI_NOT_CONFIGURED' } });
  });

  it('refuses a file that is not a video', async () => {
    expect((await POST(request({ body: withVideo('text/plain') }))).status).toBe(400);
  });

  it('returns the extracted twin', async () => {
    extractPlantWalkthrough.mockResolvedValue({ model: 'gemini', elapsedMs: 10, twin: {} });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: 'gemini' });
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureRepair, answerRepairQuestion } = vi.hoisted(() => ({
  captureRepair: vi.fn(),
  answerRepairQuestion: vi.fn(),
}));
vi.mock('@/di/server-auth', () => ({
  verifyServerSessionSubject: vi.fn().mockResolvedValue('subject'),
  loadWorkspaceAccess: vi.fn().mockResolvedValue(['PLANT_MODEL']),
}));
vi.mock('@/di/server-plant-walkthrough', () => ({
  captureRepair,
  answerRepairQuestion,
  isGeminiConfigured: () => true,
  GeminiAnswerError: class GeminiAnswerError extends Error {},
}));

import { POST as ask } from '@/app/api/repair-captures/ask/route';
import { POST as capture } from '@/app/api/repair-captures/route';
import { sessionCookieName } from '@/src/entities/models/session';

import { BELT_PROCEDURE } from '../../entities/fixtures/repair-guide';

const ORIGIN = 'http://localhost:3000';
const headers = {
  cookie: `celesnity_csrf=token; ${sessionCookieName()}=session`,
  origin: ORIGIN,
  'x-csrf-token': 'token',
};

function form(fields: Record<string, string>, video = true) {
  const body = new FormData();
  if (video) body.set('video', new File(['x'], 'belt.mp4', { type: 'video/mp4' }));
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest(`${ORIGIN}/api/repair-captures`, { method: 'POST', body, headers });
}

describe('repair capture routes', () => {
  beforeEach(() => {
    process.env.WEB_ORIGIN = ORIGIN;
    captureRepair.mockReset();
    answerRepairQuestion.mockReset();
  });

  it('needs the machine and the fault named', async () => {
    const response = await capture(form({ machineName: 'Washer W1', faultName: '' }));
    expect(response.status).toBe(400);
    expect(captureRepair).not.toHaveBeenCalled();
  });

  it('returns the captured procedure', async () => {
    captureRepair.mockResolvedValue({ value: BELT_PROCEDURE, model: 'gemini', elapsedMs: 5 });
    const response = await capture(
      form({ machineName: 'Washer W1', faultName: 'Belt', expert: 'Tuấn' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ procedure: { title: BELT_PROCEDURE.title } });
    expect(captureRepair).toHaveBeenCalledWith(
      expect.any(Blob),
      { machineName: 'Washer W1', faultName: 'Belt', expert: 'Tuấn' },
      expect.anything(),
    );
  });

  it('answers a question only with a valid guide', async () => {
    const request = (body: unknown) =>
      new NextRequest(`${ORIGIN}/api/repair-captures/ask`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { ...headers, 'content-type': 'application/json' },
      });
    expect((await ask(request({ procedure: {}, step: 0, question: 'Why?' }))).status).toBe(400);
    answerRepairQuestion.mockResolvedValue({
      value: { answer: 'Theo bước 2.', stepNumbers: [2], outsideGuide: false },
    });
    const response = await ask(
      request({ procedure: BELT_PROCEDURE, step: 1, question: 'Vì sao?' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stepNumbers: [2] });
  });
});

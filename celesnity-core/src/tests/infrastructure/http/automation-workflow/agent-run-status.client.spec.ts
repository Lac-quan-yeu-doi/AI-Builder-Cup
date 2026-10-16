import { Logger } from '@nestjs/common';

import { AgentRunStatusClient } from '@infrastructure/http/automation-workflow/agent-run-status.client';

describe('AgentRunStatusClient', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('http://minder-agent.local') };

  it('fetches and returns the run status body on 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run_id: 'r1',
        status: 'completed',
        session_id: 's1',
        finished_at: '2026-09-05T00:00:05Z',
        response_text: 'done',
        error: null,
      }),
    }) as never;

    const client = new AgentRunStatusClient(config as never);
    const result = await client.fetchStatus('r1', 'tenant-1');
    expect(result).toEqual({
      status: 'completed',
      sessionId: 's1',
      responseText: 'done',
      error: undefined,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://minder-agent.local/runs/r1/status',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Caller-Id': 'tenant-1' }),
      }),
    );
  });

  it('returns undefined on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const client = new AgentRunStatusClient(config as never);
    expect(await client.fetchStatus('missing')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"status":404'));
  });
});

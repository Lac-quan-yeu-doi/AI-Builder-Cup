import { AgentTranscriptHttpClient } from '@infrastructure/http/automation-workflow/agent-transcript.client';

describe('AgentTranscriptHttpClient', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('http://minder-agent.local') };

  it('returns the last assistant message from the session transcript', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'sess-1',
        history: [
          { role: 'user', content: 'extract the schema' },
          { role: 'assistant', content: 'schema: 12 columns' },
        ],
      }),
    }) as never;

    const client = new AgentTranscriptHttpClient(config as never);
    const result = await client.fetchTranscript('sess-1', 'tenant-1');
    expect(result).toEqual({ finalAssistantMessage: 'schema: 12 columns' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://minder-agent.local/sessions/sess-1/transcript',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Caller-Id': 'tenant-1' }),
      }),
    );
  });

  it('returns undefined finalAssistantMessage when history has no assistant entry', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'sess-1', history: [{ role: 'user', content: 'hi' }] }),
    }) as never;

    const client = new AgentTranscriptHttpClient(config as never);
    expect(await client.fetchTranscript('sess-1')).toEqual({ finalAssistantMessage: undefined });
  });

  it('returns undefined on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const client = new AgentTranscriptHttpClient(config as never);
    expect(await client.fetchTranscript('missing')).toBeUndefined();
  });
});

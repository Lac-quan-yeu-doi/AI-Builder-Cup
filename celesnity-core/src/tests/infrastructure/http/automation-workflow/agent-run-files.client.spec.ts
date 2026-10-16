import { AgentRunFilesClient } from '@infrastructure/http/automation-workflow/agent-run-files.client';
import { AuthenticatedContextStore, type AuthenticatedContext } from '@application/administration/authenticated-context';

describe('AgentRunFilesClient', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('http://minder-agent.local') };

  it('maps snake_case list DTO to camelCase entries', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [
          {
            path: 'a.txt',
            access_type: 'created',
            tool_name: 'Write',
            accessed_at: '2026-09-08T00:00:00Z',
            available: true,
            size_bytes: 5,
            mime_type: 'text/plain',
          },
        ],
      }),
    }) as never;

    const client = new AgentRunFilesClient(config as never);
    const files = await client.listFiles('run-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://minder-agent.local/runs/run-1/files',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Caller-Id': expect.any(String) }),
      }),
    );
    expect(files).toEqual([
      {
        path: 'a.txt',
        accessType: 'created',
        toolName: 'Write',
        accessedAt: '2026-09-08T00:00:00Z',
        available: true,
        sizeBytes: 5,
        mimeType: 'text/plain',
      },
    ]);
  });

  it('returns [] on a non-ok list response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const client = new AgentRunFilesClient(config as never);
    expect(await client.listFiles('missing')).toEqual([]);
  });

  it('returns content stream + headers on 200', async () => {
    const headers = new Map<string, string>([
      ['content-type', 'text/plain'],
      ['content-length', '5'],
      ['content-disposition', 'attachment; filename="a.txt"'],
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {} as ReadableStream<Uint8Array>,
      headers: { get: (k: string) => headers.get(k) ?? null },
    }) as never;

    const client = new AgentRunFilesClient(config as never);
    const content = await client.getFileContent('run-1', 'a.txt', true);
    expect(content).toBeDefined();
    expect(content?.contentType).toBe('text/plain');
    expect(content?.contentLength).toBe(5);
    expect(content?.fileName).toBe('a.txt');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://minder-agent.local/runs/run-1/files/content?path=a.txt&download=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Caller-Id': expect.any(String) }),
      }),
    );
  });

  it('reads automation files under the background identity that owns the run workspace', async () => {
    const base: AuthenticatedContext = {
      identityId: 'background',
      subject: 'background',
      identityTenantId: 'tenant',
      organizationId: 'org',
      organizationStatus: 'ACTIVE',
      mfaRequired: false,
      membershipId: 'membership',
      role: 'SERVICE_ACCOUNT',
      authenticationTime: 1,
      mfaVerified: false,
      visibleFeatures: ['AUTOMATIONS'],
      servicePermissions: ['workspace:read', 'workspace:write'],
    };
    const contexts = new AuthenticatedContextStore();
    contexts.configureBackgroundResolver(async () => base);
    const issuedFor: string[] = [];
    const issuer = {
      issue: (context: AuthenticatedContext) => {
        issuedFor.push(context.identityId);
        return 'assertion';
      },
    };
    const headers = new Map<string, string>([['content-type', 'application/pdf']]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {} as ReadableStream<Uint8Array>,
      headers: { get: (key: string) => headers.get(key) ?? null },
    }) as never;
    const client = new AgentRunFilesClient(config as never, contexts, issuer as never);
    const agentContext: AuthenticatedContext = {
      ...base,
      identityId: 'agent',
      visibleFeatures: ['DOCUMENTS'],
      automationRunId: 'run-1',
    };

    await contexts.run(agentContext, () => client.getFileContent('run-1', 'report.pdf', false));

    expect(issuedFor).toEqual(['background']);
  });

  it('returns undefined on a non-ok content response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 410 }) as never;
    const client = new AgentRunFilesClient(config as never);
    expect(await client.getFileContent('run-1', 'gone.txt', false)).toBeUndefined();
  });
});

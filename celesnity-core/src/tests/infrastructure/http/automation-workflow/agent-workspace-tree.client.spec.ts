import { AgentWorkspaceTreeClient } from '@infrastructure/http/automation-workflow/agent-workspace-tree.client';

describe('AgentWorkspaceTreeClient', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('http://minder-agent.local') };

  it('maps snake_case tree entries to camelCase and preserves truncation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            path: 'out/report.csv',
            is_dir: false,
            size_bytes: 42,
            modified_at: '2026-09-08T00:00:00Z',
          },
          { path: 'out', is_dir: true, modified_at: '2026-09-08T00:00:00Z' },
        ],
        truncated: true,
      }),
    }) as never;

    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [
        { path: 'out/report.csv', isDir: false, sizeBytes: 42, modifiedAt: '2026-09-08T00:00:00Z' },
        { path: 'out', isDir: true, sizeBytes: undefined, modifiedAt: '2026-09-08T00:00:00Z' },
      ],
      truncated: true,
    });
  });

  it('returns an empty tree on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [],
      truncated: false,
    });
  });

  it('returns an empty tree when the tree response is malformed or the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [],
      truncated: false,
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as never;
    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [],
      truncated: false,
    });
  });

  it('returns an empty tree for invalid entry shapes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [null] }),
    }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [],
      truncated: false,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [{ path: 42, is_dir: false, modified_at: '2026-09-08T00:00:00Z' }],
      }),
    }) as never;
    await expect(client.listTree('room-1', 'user-1')).resolves.toEqual({
      entries: [],
      truncated: false,
    });
  });

  it('encodes the room and path and sends the exact caller header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [], truncated: false }),
      body: null,
      headers: { get: () => null },
    }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await client.listTree('room/1', 'user-1');
    expect(global.fetch).toHaveBeenLastCalledWith(
      'http://minder-agent.local/rooms/room%2F1/workspace/tree',
      { headers: { 'X-Caller-Id': 'user-1' } },
    );

    await client.getContent('room/1', 'out/report final.csv', false, 'user-1');
    expect(global.fetch).toHaveBeenLastCalledWith(
      'http://minder-agent.local/rooms/room%2F1/workspace/content?path=out%2Freport%20final.csv&download=0',
      { headers: { 'X-Caller-Id': 'user-1' } },
    );
  });

  it('maps content body, headers, and disposition filename', async () => {
    const body = {} as ReadableStream<Uint8Array>;
    const headers = new Map<string, string>([
      ['content-type', 'text/csv'],
      ['content-length', '42'],
      ['content-disposition', 'attachment; filename="report.csv"'],
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body,
      headers: { get: (key: string) => headers.get(key) ?? null },
    }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.getContent('room-1', 'out/report.csv', true, 'user-1')).resolves.toEqual({
      body,
      contentType: 'text/csv',
      contentLength: 42,
      fileName: 'report.csv',
    });
  });

  it('falls back to the final path segment or download for content filenames', async () => {
    const response = {
      ok: true,
      body: null,
      headers: { get: () => null },
    };
    global.fetch = jest.fn().mockResolvedValue(response) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(
      client.getContent('room-1', 'out/report final.csv', true, 'user-1'),
    ).resolves.toMatchObject({
      contentType: 'application/octet-stream',
      fileName: 'report final.csv',
    });
    await expect(client.getContent('room-1', '', false, 'user-1')).resolves.toMatchObject({
      fileName: 'download',
    });
  });

  it('returns undefined on a non-ok content response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const client = new AgentWorkspaceTreeClient(config as never);

    await expect(client.getContent('room-1', 'gone.txt', false, 'user-1')).resolves.toBeUndefined();
  });
});

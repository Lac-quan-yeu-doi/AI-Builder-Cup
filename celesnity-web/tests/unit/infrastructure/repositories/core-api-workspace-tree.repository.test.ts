import { describe, expect, it } from 'vitest';

import { NotFoundError, RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { CoreApiWorkspaceTreeRepository } from '@/src/infrastructure/repositories/core-api-workspace-tree.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  public readonly streamRequests: RecordedRequest[] = [];

  public constructor(
    private readonly responses: unknown[] = [],
    private readonly streamResponse?: Response | Error,
  ) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init === undefined ? {} : { init }) });
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response as TResponse;
  }

  public async stream(path: string, init?: RequestInit): Promise<Response> {
    this.streamRequests.push({ path, ...(init === undefined ? {} : { init }) });
    if (this.streamResponse instanceof Error) throw this.streamResponse;
    if (this.streamResponse === undefined) throw new Error('no stream response configured');
    return this.streamResponse;
  }
}

describe('CoreApiWorkspaceTreeRepository', () => {
  it('maps a tree response and encodes the room id', async () => {
    const transport = new FakeTransport([
      {
        entries: [
          { path: 'src', isDir: true, modifiedAt: '2026-09-09T00:00:00Z' },
          { path: 'src/main.ts', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:01Z' },
        ],
        truncated: true,
      },
    ]);
    const repository = new CoreApiWorkspaceTreeRepository(transport);

    await expect(repository.listTree('room/with space')).resolves.toEqual({
      entries: [
        { path: 'src', isDir: true, modifiedAt: '2026-09-09T00:00:00Z' },
        { path: 'src/main.ts', isDir: false, sizeBytes: 12, modifiedAt: '2026-09-09T00:00:01Z' },
      ],
      truncated: true,
    });
    expect(transport.requests).toEqual([
      { path: '/rooms/room%2Fwith%20space/workspace/tree', init: { method: 'GET' } },
    ]);
  });

  it('streams file content, maps headers and size, and encodes room and path', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const response = new Response(blob, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="report.txt"',
      },
    });
    const transport = new FakeTransport([], response);
    const repository = new CoreApiWorkspaceTreeRepository(transport);

    const result = await repository.getFileContent('room/1', 'dir/report ?.txt');

    expect(transport.streamRequests).toEqual([
      { path: '/rooms/room%2F1/workspace/content?path=dir%2Freport%20%3F.txt' },
    ]);
    expect(result.mimeType).toBe('text/plain; charset=utf-8');
    expect(result.sizeBytes).toBe(blob.size);
    expect(result.fileName).toBe('report.txt');
    expect(await result.blob.text()).toBe('hello');
  });

  it('decodes RFC 5987 encoded filenames from filename* dispositions', async () => {
    const response = new Response(new Blob(['hello']), {
      status: 200,
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''report%20final.txt",
      },
    });
    const transport = new FakeTransport([], response);
    const repository = new CoreApiWorkspaceTreeRepository(transport);

    await expect(repository.getFileContent('room-1', 'dir/report.txt')).resolves.toMatchObject({
      fileName: 'report final.txt',
    });
  });

  it('falls back to the requested basename when no filename disposition is present', async () => {
    const response = new Response(new Blob(['{}']), { status: 200 });
    const transport = new FakeTransport([], response);
    const repository = new CoreApiWorkspaceTreeRepository(transport);

    await expect(repository.getFileContent('room-1', 'dir/config.json')).resolves.toMatchObject({
      fileName: 'config.json',
      mimeType: 'application/octet-stream',
    });
  });

  it('translates Core API failures before they cross the repository boundary', async () => {
    const listRepository = new CoreApiWorkspaceTreeRepository(
      new FakeTransport([new CoreApiError(404, 'room not found')]),
    );
    const streamRepository = new CoreApiWorkspaceTreeRepository(
      new FakeTransport([], new TypeError('fetch failed')),
    );

    await expect(listRepository.listTree('missing')).rejects.toMatchObject({
      constructor: NotFoundError,
    });
    await expect(streamRepository.getFileContent('room-1', 'a.txt')).rejects.toMatchObject({
      constructor: RemoteServiceError,
    });
  });
});

it('maps optional MIME metadata from a tree response', async () => {
  const transport = new FakeTransport([
    {
      entries: [
        {
          path: 'notes.md',
          isDir: false,
          sizeBytes: 12,
          modifiedAt: '2026-09-09T00:00:00Z',
          mimeType: 'text/markdown; charset=utf-8',
        },
      ],
      truncated: false,
    },
  ]);
  const repository = new CoreApiWorkspaceTreeRepository(transport);

  await expect(repository.listTree('room-1')).resolves.toEqual({
    entries: [
      {
        path: 'notes.md',
        isDir: false,
        sizeBytes: 12,
        modifiedAt: '2026-09-09T00:00:00Z',
        mimeType: 'text/markdown; charset=utf-8',
      },
    ],
    truncated: false,
  });
});

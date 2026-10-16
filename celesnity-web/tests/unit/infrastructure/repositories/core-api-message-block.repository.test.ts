import { MessageBlockCursorInvalidError } from '@/src/entities/errors/message-block-cursor-invalid-error';
import { describe, expect, it, vi } from 'vitest';

import { CoreApiMessageBlockRepository } from '@/src/infrastructure/repositories/core-api-message-block.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { ConflictError, RemoteServiceError } from '@/src/entities/errors/application-errors';

function fakeTransport(): GeneratedApiTransport {
  return { request: vi.fn(), stream: vi.fn() };
}

describe('CoreApiMessageBlockRepository.listByRoom', () => {
  it('requests GET /rooms/{roomId}/message-blocks with an encoded roomId and no query when cursor is absent', async () => {
    const transport = fakeTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const repository = new CoreApiMessageBlockRepository(transport);

    await repository.listByRoom('room/1');

    expect(transport.request).toHaveBeenCalledWith('/rooms/room%2F1/message-blocks', {
      method: 'GET',
    });
  });

  it('appends ?cursor= when a cursor is given', async () => {
    const transport = fakeTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const repository = new CoreApiMessageBlockRepository(transport);

    await repository.listByRoom('room-1', 'abc');

    expect(transport.request).toHaveBeenCalledWith('/rooms/room-1/message-blocks?cursor=abc', {
      method: 'GET',
    });
  });

  it('maps every DTO field from snake_case to the domain entity', async () => {
    const transport = fakeTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'block-1',
        room_id: 'room-1',
        run_id: 'run-1',
        block_type: 'text',
        version: 1,
        payload: { text: 'hi' },
        fallback_text: 'hi',
        published_at: '2026-08-18T00:00:00.000Z',
      },
    ]);
    const repository = new CoreApiMessageBlockRepository(transport);

    const blocks = await repository.listByRoom('room-1');

    expect(blocks).toEqual([
      {
        id: 'block-1',
        roomId: 'room-1',
        runId: 'run-1',
        blockType: 'text',
        version: 1,
        payload: { text: 'hi' },
        fallbackText: 'hi',
        publishedAt: '2026-08-18T00:00:00.000Z',
      },
    ]);
  });

  it('maps a null run_id through as null', async () => {
    const transport = fakeTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'block-1',
        room_id: 'room-1',
        run_id: null,
        block_type: 'text',
        version: 1,
        payload: {},
        fallback_text: 'x',
        published_at: '2026-08-18T00:00:00.000Z',
      },
    ]);
    const repository = new CoreApiMessageBlockRepository(transport);

    const [block] = await repository.listByRoom('room-1');

    expect(block?.runId).toBeNull();
  });

  it('preserves the invalid-cursor signal separately from empty valid history and unrelated conflicts', async () => {
    const transport = fakeTransport();
    const request = transport.request as ReturnType<typeof vi.fn>;
    const repository = new CoreApiMessageBlockRepository(transport);
    request.mockRejectedValueOnce(
      new CoreApiError(409, 'Cursor cannot be replayed', 'MESSAGE_BLOCK_CURSOR_INVALID'),
    );
    await expect(repository.listByRoom('room', 'cursor')).rejects.toBeInstanceOf(
      MessageBlockCursorInvalidError,
    );
    request.mockResolvedValueOnce([]);
    expect(await repository.listByRoom('room', 'valid-cursor')).toEqual([]);
    request.mockRejectedValueOnce(new CoreApiError(409, 'Conflict', 'OTHER_CONFLICT'));
    await expect(repository.listByRoom('room')).rejects.toBeInstanceOf(ConflictError);
  });

  it('translates a transport error', async () => {
    const transport = fakeTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CoreApiError(500, 'boom'),
    );
    const repository = new CoreApiMessageBlockRepository(transport);

    await expect(repository.listByRoom('room-1')).rejects.toBeInstanceOf(RemoteServiceError);
  });
});

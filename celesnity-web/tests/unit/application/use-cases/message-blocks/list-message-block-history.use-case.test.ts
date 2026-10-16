import { describe, expect, it, vi } from 'vitest';

import { createListMessageBlockHistoryUseCase } from '@/src/application/use-cases/message-blocks/list-message-block-history.use-case';
import type { MessageBlockRepository } from '@/src/application/repositories/message-block.repository.interface';
import type { MessageBlock } from '@/src/entities/models/message-block';

function block(overrides: Partial<MessageBlock> = {}): MessageBlock {
  return {
    id: 'block-1',
    roomId: 'room-1',
    runId: null,
    blockType: 'text',
    version: 1,
    payload: { text: 'hi' },
    fallbackText: 'hi',
    publishedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('createListMessageBlockHistoryUseCase', () => {
  it('delegates to the repository with roomId and cursor', async () => {
    const repository: MessageBlockRepository = { listByRoom: vi.fn().mockResolvedValue([block()]) };
    const useCase = createListMessageBlockHistoryUseCase(repository);

    const result = await useCase('room-1', 'cursor-1');

    expect(repository.listByRoom).toHaveBeenCalledWith('room-1', 'cursor-1');
    expect(result).toEqual([block()]);
  });

  it('omits the cursor argument when none is given', async () => {
    const repository: MessageBlockRepository = { listByRoom: vi.fn().mockResolvedValue([]) };
    const useCase = createListMessageBlockHistoryUseCase(repository);

    await useCase('room-1');

    expect(repository.listByRoom).toHaveBeenCalledWith('room-1', undefined);
  });
});

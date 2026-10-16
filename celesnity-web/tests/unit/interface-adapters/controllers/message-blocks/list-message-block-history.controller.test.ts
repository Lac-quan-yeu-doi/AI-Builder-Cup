import { describe, expect, it, vi } from 'vitest';

import { createListMessageBlockHistoryController } from '@/src/interface-adapters/controllers/message-blocks/list-message-block-history.controller';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { MessageBlock } from '@/src/entities/models/message-block';

function block(): MessageBlock {
  return {
    id: 'block-1',
    roomId: 'room-1',
    runId: 'run-1',
    blockType: 'text',
    version: 1,
    payload: { text: 'hi' },
    fallbackText: 'hi',
    publishedAt: '2026-08-18T00:00:00.000Z',
  };
}

describe('createListMessageBlockHistoryController', () => {
  it('calls the use case once and returns presented view models', async () => {
    const useCase = vi.fn().mockResolvedValue([block()]);
    const controller = createListMessageBlockHistoryController(useCase);

    const result = await controller('room-1');

    expect(useCase).toHaveBeenCalledTimes(1);
    expect(useCase).toHaveBeenCalledWith('room-1', undefined);
    expect(result).toEqual([
      {
        id: 'block-1',
        runId: 'run-1',
        blockType: 'text',
        payload: { text: 'hi' },
        fallbackText: 'hi',
        publishedAt: '2026-08-18T00:00:00.000Z',
      },
    ]);
  });

  it('rejects an empty roomId before calling the use case', async () => {
    const useCase = vi.fn();
    const controller = createListMessageBlockHistoryController(useCase);

    await expect(controller('')).rejects.toBeInstanceOf(InputParseError);
    expect(useCase).not.toHaveBeenCalled();
  });
});

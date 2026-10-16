import { describe, expect, it, vi } from 'vitest';

import { createSubscribeMessageBlocksController } from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { MessageBlock } from '@/src/entities/models/message-block';
import type { SubscribeMessageBlocksHandlers } from '@/src/application/use-cases/message-blocks/subscribe-message-blocks.use-case';

function block(): MessageBlock {
  return {
    id: 'block-1',
    roomId: 'room-1',
    runId: 'run-1',
    blockType: 'text',
    version: 1,
    payload: {},
    fallbackText: 'x',
    publishedAt: '2026-08-18T00:00:00.000Z',
  };
}

describe('createSubscribeMessageBlocksController', () => {
  it('validates roomId, calls the use case once, and presents blocks passed to onBlock', () => {
    let handlers: SubscribeMessageBlocksHandlers | undefined;
    const close = vi.fn();
    const useCase = vi.fn((_roomId: string, h: SubscribeMessageBlocksHandlers) => {
      handlers = h;
      return { close };
    });
    const controller = createSubscribeMessageBlocksController(useCase);
    const onBlock = vi.fn();

    const subscription = controller('room-1', { onBlock, onError: vi.fn() });

    expect(useCase).toHaveBeenCalledTimes(1);
    handlers?.onBlock(block());
    expect(onBlock).toHaveBeenCalledWith({
      id: 'block-1',
      runId: 'run-1',
      blockType: 'text',
      payload: {},
      fallbackText: 'x',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });

    subscription.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('forwards a cursor to the use case when given one', () => {
    const useCase = vi.fn().mockReturnValue({ close: vi.fn() });
    const controller = createSubscribeMessageBlocksController(useCase);

    controller('room-1', { onBlock: vi.fn(), onError: vi.fn() }, 'block-9');

    expect(useCase).toHaveBeenCalledWith('room-1', expect.anything(), 'block-9');
  });

  it('throws before subscribing when roomId is empty', () => {
    const useCase = vi.fn();
    const controller = createSubscribeMessageBlocksController(useCase);

    expect(() => controller('', { onBlock: vi.fn(), onError: vi.fn() })).toThrow(InputParseError);
    expect(useCase).not.toHaveBeenCalled();
  });
});

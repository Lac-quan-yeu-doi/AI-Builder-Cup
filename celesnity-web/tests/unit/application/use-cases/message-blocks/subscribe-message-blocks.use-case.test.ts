import { describe, expect, it, vi } from 'vitest';

import { createSubscribeMessageBlocksUseCase } from '@/src/application/use-cases/message-blocks/subscribe-message-blocks.use-case';
import type {
  MessageBlockProgressObserver,
  MessageBlockProgressService,
} from '@/src/application/services/message-block-progress.service.interface';
import type { MessageBlock } from '@/src/entities/models/message-block';

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

describe('createSubscribeMessageBlocksUseCase', () => {
  it('subscribes to the progress service for the given room and forwards blocks/errors', () => {
    let observer: MessageBlockProgressObserver | undefined;
    const close = vi.fn();
    const progressService: MessageBlockProgressService = {
      subscribe: vi.fn((_roomId, obs) => {
        observer = obs;
        return { close };
      }),
    };
    const useCase = createSubscribeMessageBlocksUseCase(progressService);
    const onBlock = vi.fn();
    const onError = vi.fn();

    const subscription = useCase('room-1', { onBlock, onError });

    expect(progressService.subscribe).toHaveBeenCalledWith('room-1', expect.anything(), undefined);
    observer?.onBlock(block());
    expect(onBlock).toHaveBeenCalledWith(block());
    observer?.onError('boom');
    expect(onError).toHaveBeenCalledWith('boom');

    subscription.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('forwards a cursor to the progress service when given one', () => {
    const progressService: MessageBlockProgressService = {
      subscribe: vi.fn().mockReturnValue({ close: vi.fn() }),
    };
    const useCase = createSubscribeMessageBlocksUseCase(progressService);

    useCase('room-1', { onBlock: vi.fn(), onError: vi.fn() }, 'block-5');

    expect(progressService.subscribe).toHaveBeenCalledWith('room-1', expect.anything(), 'block-5');
  });

  it('forwards recovery and bounded close reason without taking ownership of retry timing', async () => {
    let observer: MessageBlockProgressObserver | undefined;
    const close = vi.fn();
    const progressService: MessageBlockProgressService = {
      subscribe: vi.fn((_room, next) => {
        observer = next;
        return { close };
      }),
    };
    const recover = vi.fn().mockResolvedValue({ cursor: 'restored', resume: true });
    const subscription = createSubscribeMessageBlocksUseCase(progressService)('room', {
      onBlock: vi.fn(),
      onError: vi.fn(),
      recover,
    });
    expect(await observer?.recover?.('cursor_reset')).toEqual({ cursor: 'restored', resume: true });
    expect(recover).toHaveBeenCalledWith('cursor_reset');
    subscription.close('room_change');
    subscription.close('unmount');
    expect(close).toHaveBeenCalledExactlyOnceWith('room_change');
  });

  it('close() is idempotent', () => {
    const close = vi.fn();
    const progressService: MessageBlockProgressService = {
      subscribe: vi.fn().mockReturnValue({ close }),
    };
    const useCase = createSubscribeMessageBlocksUseCase(progressService);

    const subscription = useCase('room-1', { onBlock: vi.fn(), onError: vi.fn() });
    subscription.close();
    subscription.close();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stops forwarding blocks after close()', () => {
    let observer: MessageBlockProgressObserver | undefined;
    const progressService: MessageBlockProgressService = {
      subscribe: vi.fn((_roomId, obs) => {
        observer = obs;
        return { close: vi.fn() };
      }),
    };
    const useCase = createSubscribeMessageBlocksUseCase(progressService);
    const onBlock = vi.fn();

    const subscription = useCase('room-1', { onBlock, onError: vi.fn() });
    subscription.close();
    observer?.onBlock(block());

    expect(onBlock).not.toHaveBeenCalled();
  });
});

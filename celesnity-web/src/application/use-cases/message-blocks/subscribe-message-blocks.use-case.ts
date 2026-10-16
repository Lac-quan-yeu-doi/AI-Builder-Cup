import type {
  MessageBlockStreamLifecycle,
  MessageBlockCloseReason,
} from '@/src/entities/models/message-block-stream';
import type {
  MessageBlockProgressObserver,
  MessageBlockProgressService,
} from '@/src/application/services/message-block-progress.service.interface';
import type { MessageBlock } from '@/src/entities/models/message-block';

export interface SubscribeMessageBlocksHandlers extends MessageBlockStreamLifecycle {
  onBlock(block: MessageBlock): void;
  onError(error: unknown): void;
}

export interface MessageBlockSubscription {
  close(reason?: MessageBlockCloseReason): void;
}

export type SubscribeMessageBlocksUseCase = ReturnType<typeof createSubscribeMessageBlocksUseCase>;

export const createSubscribeMessageBlocksUseCase =
  (progressService: MessageBlockProgressService) =>
  (
    roomId: string,
    handlers: SubscribeMessageBlocksHandlers,
    cursor?: string,
  ): MessageBlockSubscription => {
    let closed = false;

    const observer: MessageBlockProgressObserver = {
      recover: handlers.recover,
      shouldReconnect: handlers.shouldReconnect,
      onStateChange: (state) => {
        if (!closed) handlers.onStateChange?.(state);
      },
      onBlock: (block) => {
        if (!closed) {
          handlers.onBlock(block);
        }
      },
      onError: (error) => {
        if (!closed) {
          handlers.onError(error);
        }
      },
    };

    const subscription = progressService.subscribe(roomId, observer, cursor);

    return {
      close: (reason) => {
        if (closed) {
          return;
        }
        closed = true;
        if (reason === undefined) subscription.close();
        else subscription.close(reason);
      },
    };
  };

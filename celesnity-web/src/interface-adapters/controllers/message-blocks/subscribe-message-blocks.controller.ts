import type { MessageBlockStreamLifecycle } from '@/src/entities/models/message-block-stream';
import type {
  MessageBlockSubscription,
  SubscribeMessageBlocksUseCase,
} from '@/src/application/use-cases/message-blocks/subscribe-message-blocks.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentMessageBlock,
  type MessageBlockViewModel,
} from '@/src/interface-adapters/presenters/message-block.presenter';

import { roomIdSchema } from './message-blocks.schemas';

export interface SubscribeMessageBlocksControllerHandlers extends MessageBlockStreamLifecycle {
  onBlock(block: MessageBlockViewModel): void;
  onError(error: unknown): void;
}

export type SubscribeMessageBlocksController = ReturnType<
  typeof createSubscribeMessageBlocksController
>;

export const createSubscribeMessageBlocksController =
  (useCase: SubscribeMessageBlocksUseCase) =>
  (
    roomId: string,
    handlers: SubscribeMessageBlocksControllerHandlers,
    cursor?: string,
  ): MessageBlockSubscription => {
    const parsed = roomIdSchema.safeParse(roomId);
    if (!parsed.success) {
      throw new InputParseError('Invalid room identifier', { cause: parsed.error });
    }
    return useCase(
      parsed.data,
      {
        onBlock: (block) => handlers.onBlock(presentMessageBlock(block)),
        onError: handlers.onError,
        onStateChange: handlers.onStateChange,
        shouldReconnect: handlers.shouldReconnect,
        recover: handlers.recover,
      },
      cursor,
    );
  };

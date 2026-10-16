import type { ListMessageBlockHistoryUseCase } from '@/src/application/use-cases/message-blocks/list-message-block-history.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentMessageBlock,
  type MessageBlockViewModel,
} from '@/src/interface-adapters/presenters/message-block.presenter';

import { roomIdSchema } from './message-blocks.schemas';

export type ListMessageBlockHistoryController = ReturnType<
  typeof createListMessageBlockHistoryController
>;

export const createListMessageBlockHistoryController =
  (useCase: ListMessageBlockHistoryUseCase) =>
  async (roomId: string, cursor?: string): Promise<readonly MessageBlockViewModel[]> => {
    const parsed = roomIdSchema.safeParse(roomId);
    if (!parsed.success) {
      throw new InputParseError('Invalid room identifier', { cause: parsed.error });
    }
    const blocks = await useCase(parsed.data, cursor);
    return blocks.map(presentMessageBlock);
  };

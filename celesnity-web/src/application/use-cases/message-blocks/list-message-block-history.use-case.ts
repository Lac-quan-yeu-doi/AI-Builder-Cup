import type { MessageBlockRepository } from '@/src/application/repositories/message-block.repository.interface';
import type { MessageBlock } from '@/src/entities/models/message-block';

export type ListMessageBlockHistoryUseCase = ReturnType<
  typeof createListMessageBlockHistoryUseCase
>;

export const createListMessageBlockHistoryUseCase =
  (repository: MessageBlockRepository) =>
  (roomId: string, cursor?: string): Promise<readonly MessageBlock[]> =>
    repository.listByRoom(roomId, cursor);

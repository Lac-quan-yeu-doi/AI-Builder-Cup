import type { MessageBlock } from '@/src/entities/models/message-block';

export interface MessageBlockRepository {
  listByRoom(roomId: string, cursor?: string): Promise<readonly MessageBlock[]>;
}

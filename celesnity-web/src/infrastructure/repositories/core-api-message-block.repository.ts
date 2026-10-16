import type { MessageBlockRepository } from '@/src/application/repositories/message-block.repository.interface';
import type { MessageBlock, MessageBlockType } from '@/src/entities/models/message-block';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { MessageBlockCursorInvalidError } from '@/src/entities/errors/message-block-cursor-invalid-error';

type MessageBlockResponseDto = components['schemas']['MessageBlockResponse'];

export class CoreApiMessageBlockRepository implements MessageBlockRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listByRoom(roomId: string, cursor?: string): Promise<readonly MessageBlock[]> {
    const response = await this.request<MessageBlockResponseDto[]>(
      messageBlocksPath(roomId, cursor),
      {
        method: 'GET',
      },
    );
    return response.map(mapMessageBlock);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      if (
        error instanceof CoreApiError &&
        error.status === 409 &&
        error.code === 'MESSAGE_BLOCK_CURSOR_INVALID'
      ) {
        throw new MessageBlockCursorInvalidError();
      }
      throw translateCoreApiError(error);
    }
  }
}

function messageBlocksPath(roomId: string, cursor?: string): string {
  const base = `/rooms/${encodeURIComponent(roomId)}/message-blocks`;
  return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
}

function mapMessageBlock(dto: MessageBlockResponseDto): MessageBlock {
  return {
    id: dto.id,
    roomId: dto.room_id,
    runId: dto.run_id,
    blockType: dto.block_type as MessageBlockType,
    version: dto.version,
    payload: dto.payload,
    fallbackText: dto.fallback_text,
    publishedAt: dto.published_at,
  };
}

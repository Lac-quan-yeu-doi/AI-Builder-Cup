import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';
import { MESSAGE_BLOCK_TYPES, type MessageBlock } from '@domain/message-block/models/message-block';
import type { IMessageBlockRepository } from './interfaces/i-message-block.repository';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

export interface PublishBlockInput {
  readonly roomId: string;
  readonly runId?: string;
  readonly blockType: string;
  readonly version?: number;
  readonly payload: Record<string, unknown>;
  readonly fallbackText: string;
}

export class MessageBlockUseCases {
  public constructor(
    private readonly repository: IMessageBlockRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public bindRoom(roomId: string, agentName: string): Promise<void> {
    const normalized = roomId.trim();
    if (normalized.length === 0 || normalized.length > 255) {
      throw new Error('Agent room ID must contain between 1 and 255 characters.');
    }
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(agentName))
      throw new Error('A valid organization agent name is required.');
    const principal = this.contexts.require();
    return this.repository.bindRoom(normalized, agentName, principal);
  }

  public async publish(input: PublishBlockInput): Promise<MessageBlock> {
    if (!MESSAGE_BLOCK_TYPES.includes(input.blockType as (typeof MESSAGE_BLOCK_TYPES)[number])) {
      throw MessageBlockError.invalidBlockType(input.blockType);
    }
    if (!input.payload || typeof input.payload !== 'object') {
      throw MessageBlockError.missingPayload();
    }
    if (!input.fallbackText?.trim()) {
      throw MessageBlockError.missingFallbackText();
    }

    const block: MessageBlock = {
      id: this.ids.next(),
      roomId: input.roomId,
      runId: input.runId ?? null,
      blockType: input.blockType,
      version: input.version ?? 1,
      payload: input.payload,
      fallbackText: input.fallbackText,
      publishedAt: this.clock.now().toISOString(),
    };

    return this.repository.create(block);
  }

  public listByRoom(
    roomId: string,
    cursor?: string,
    limit?: number,
  ): Promise<readonly MessageBlock[]> {
    const principal = this.contexts.require();
    return this.repository.listByRoom(roomId, principal.organizationId, cursor, limit ?? 50);
  }
}

import type { MessageBlock, MessageBlockType } from '@/src/entities/models/message-block';

export interface MessageBlockViewModel {
  readonly id: string;
  readonly runId: string | null;
  readonly blockType: MessageBlockType;
  readonly payload: Record<string, unknown>;
  readonly fallbackText: string;
  /**
   * When Core published it. The only ordering the UI has for blocks restored
   * from history — the agent's transcript carries no timestamps of its own.
   */
  readonly publishedAt?: string;
}

export function presentMessageBlock(block: MessageBlock): MessageBlockViewModel {
  return Object.freeze({
    id: block.id,
    runId: block.runId,
    blockType: block.blockType,
    payload: block.payload,
    fallbackText: block.fallbackText,
    publishedAt: block.publishedAt,
  });
}

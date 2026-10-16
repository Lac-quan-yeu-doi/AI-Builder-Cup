import { ApiProperty } from '@nestjs/swagger';

import { MESSAGE_BLOCK_TYPES, type MessageBlock } from '@domain/message-block/models/message-block';

export class MessageBlockResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly room_id: string;

  @ApiProperty({ nullable: true, type: String })
  public readonly run_id: string | null;

  @ApiProperty({ enum: MESSAGE_BLOCK_TYPES })
  public readonly block_type: string;

  @ApiProperty()
  public readonly version: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly payload: Record<string, unknown>;

  @ApiProperty()
  public readonly fallback_text: string;

  @ApiProperty({ format: 'date-time' })
  public readonly published_at: string;

  private constructor(block: MessageBlock) {
    this.id = block.id;
    this.room_id = block.roomId;
    this.run_id = block.runId;
    this.block_type = block.blockType;
    this.version = block.version;
    this.payload = block.payload;
    this.fallback_text = block.fallbackText;
    this.published_at = block.publishedAt;
  }

  public static from(block: MessageBlock): MessageBlockResponse {
    return new MessageBlockResponse(block);
  }

  public static fromList(blocks: readonly MessageBlock[]): readonly MessageBlockResponse[] {
    return blocks.map((block) => MessageBlockResponse.from(block));
  }
}

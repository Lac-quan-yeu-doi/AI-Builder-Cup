export class MessageBlockError extends Error {
  public readonly code: string;
  private constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MessageBlockError';
  }

  public static invalidBlockType(blockType: string): MessageBlockError {
    return new MessageBlockError('INVALID_BLOCK_TYPE', `Unsupported block type: ${blockType}`);
  }

  public static missingPayload(): MessageBlockError {
    return new MessageBlockError('MISSING_PAYLOAD', 'Block payload is required.');
  }

  public static missingFallbackText(): MessageBlockError {
    return new MessageBlockError('MISSING_FALLBACK_TEXT', 'Fallback text is required.');
  }

  public static invalidCursor(): MessageBlockError {
    return new MessageBlockError(
      'MESSAGE_BLOCK_CURSOR_INVALID',
      'The message-block cursor cannot be replayed. Reload room state and history.',
    );
  }
}

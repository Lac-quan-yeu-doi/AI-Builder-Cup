export class MessageBlockCursorInvalidError extends Error {
  public constructor() {
    super('The message-block cursor cannot be replayed.');
    this.name = 'MessageBlockCursorInvalidError';
  }
}

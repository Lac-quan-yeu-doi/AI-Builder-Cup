import type { Response } from 'express';
import type { MessageBlockSseTransport } from './message-block-sse.transport';
import type { MessageBlockStreamLifecycle } from './message-block-stream.lifecycle';

/** Bridges the Nest controller's response to the subscription lifecycle. */
export class MessageBlockStreamWriter {
  public constructor(
    private readonly lifecycle: MessageBlockStreamLifecycle,
    private readonly transport: MessageBlockSseTransport,
  ) {}

  public stream(
    response: Response,
    roomId: string,
    organization: string,
    identity: string,
    initialCursor?: string,
    requestId?: string | string[],
  ): Promise<void> {
    return this.lifecycle.stream(
      this.transport.create(response),
      roomId,
      organization,
      identity,
      initialCursor,
      typeof requestId === 'string' ? requestId : undefined,
    );
  }
}

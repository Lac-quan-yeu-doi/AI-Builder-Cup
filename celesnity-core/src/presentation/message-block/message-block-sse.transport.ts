import type { Response } from 'express';
import type { StreamCloseReason, StreamRejection } from './message-block-stream.admission';
import {
  registerMessageBlockHttpStream,
  type MessageBlockHttpOutcome,
} from '@presentation/http/message-block-http-outcome';

export class SlowSseConsumer extends Error {}
export class OversizedSseFrame extends Error {}

/** The only adapter that knows about Express response headers, byte frames, and drain events. */
export class MessageBlockSseTransport {
  public create(response: Response): MessageBlockSseConnection {
    return new MessageBlockSseConnection(response);
  }
}

/** One connection; at most the lifecycle poll loop and one heartbeat await a write. */
export class MessageBlockSseConnection {
  private writing: Promise<void> = Promise.resolve();
  private outcome?: MessageBlockHttpOutcome;

  public constructor(private readonly response: Response) {}

  public reject(scope: StreamRejection | 'shutdown'): void {
    this.response.status(scope === 'shutdown' ? 503 : 429).setHeader('Retry-After', '10');
    this.response.json({
      error:
        scope === 'shutdown'
          ? { code: 'STREAM_SHUTTING_DOWN' }
          : { code: 'STREAM_CAPACITY_EXCEEDED', scope },
    });
  }

  public onDisconnect(callback: () => void): () => void {
    this.response.once('close', callback);
    this.response.once('error', callback);
    return () => {
      this.response.removeListener('close', callback);
      this.response.removeListener('error', callback);
    };
  }

  public start(): boolean {
    this.response.status(200);
    this.outcome = registerMessageBlockHttpStream(this.response);
    this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.response.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
    this.response.setHeader('X-Accel-Buffering', 'no');
    this.response.flushHeaders();
    return !this.response.destroyed;
  }

  public setCloseReason(reason: StreamCloseReason): void {
    if (this.outcome) this.outcome.reason = reason;
  }

  public send(name: string, data: unknown, signal: AbortSignal): Promise<void> {
    const frame = encode(name, data);
    if (Buffer.byteLength(frame, 'utf8') > 1_048_576) throw new OversizedSseFrame();
    const next = this.writing.then(async (): Promise<void> => {
      signal.throwIfAborted();
      if (!this.response.write(frame)) await drain(this.response, signal);
    });
    this.writing = next.catch(() => undefined);
    return next;
  }

  public async finish(reason: StreamCloseReason): Promise<StreamCloseReason> {
    this.setCloseReason(reason);
    await this.writing;
    if (!this.response.destroyed) {
      if (reason === 'rotation') this.response.write(encode('stream_end', { reason: 'rotation' }));
      if (reason === 'slow_consumer') this.destroy();
      else if (!(await finishResponse(this.response, () => this.setCloseReason('slow_consumer'))))
        return 'slow_consumer';
    }
    return reason;
  }

  public destroy(): void {
    this.response.destroy();
  }
}

function encode(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
function drain(response: Response, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      response.removeListener('drain', drained);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    };
    const drained = (): void => finish();
    const aborted = (): void => finish(new Error('SSE transport stopped'));
    const timer = setTimeout(() => finish(new SlowSseConsumer()), 10_000);
    response.once('drain', drained);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** Hold admission until HTTP finish/close, with a bounded grace period for the final frame. */
function finishResponse(response: Response, slowConsumer: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (drained: boolean): void => {
      clearTimeout(timer);
      response.removeListener('finish', completed);
      response.removeListener('close', closed);
      resolve(drained);
    };
    const completed = (): void => finish(true);
    const closed = (): void => finish(true);
    const timer = setTimeout(() => {
      slowConsumer();
      finish(false);
      response.destroy();
    }, 10_000);
    response.once('finish', completed);
    response.once('close', closed);
    try {
      response.end();
    } catch {
      slowConsumer();
      finish(false);
      response.destroy();
    }
  });
}

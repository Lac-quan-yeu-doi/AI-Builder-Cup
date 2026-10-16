import { Logger } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common';
import type { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import type {
  MessageBlockStreamAdmission,
  StreamCloseReason,
} from './message-block-stream.admission';
import {
  type MessageBlockSseConnection,
  OversizedSseFrame,
  SlowSseConsumer,
} from './message-block-sse.transport';
import { MessageBlockResponse } from './message-block.response';
import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';

/** Subscription policy for a durable projection. It never owns or cancels an agent run. */
export class MessageBlockStreamLifecycle implements OnApplicationShutdown, OnModuleDestroy {
  private readonly stop = new Set<() => void>();
  private shuttingDown = false;
  private readonly logger = new Logger(MessageBlockStreamLifecycle.name);

  public constructor(
    private readonly useCases: MessageBlockUseCases,
    private readonly admission: MessageBlockStreamAdmission,
  ) {}

  public onModuleDestroy(): void {
    this.onApplicationShutdown();
  }

  public onApplicationShutdown(): void {
    this.shuttingDown = true;
    for (const stop of this.stop) stop();
  }

  public async stream(
    connection: MessageBlockSseConnection,
    roomId: string,
    organization: string,
    identity: string,
    initialCursor?: string,
    requestId?: string,
  ): Promise<void> {
    const startedAt = performance.now();
    const common = { requestId, roomId };
    if (this.shuttingDown) {
      this.logger.warn(
        JSON.stringify({
          event: 'message_block_stream_rejected',
          ...common,
          scope: 'shutdown',
          service: 'celesnity-core',
          occurredAt: new Date().toISOString(),
        }),
      );
      connection.reject('shutdown');
      return;
    }
    const slot = this.admission.acquire(organization, identity);
    if (typeof slot === 'string') {
      this.logger.warn(
        JSON.stringify({
          event: 'message_block_stream_rejected',
          ...common,
          scope: slot,
          service: 'celesnity-core',
          occurredAt: new Date().toISOString(),
        }),
      );
      connection.reject(slot);
      return;
    }
    this.logger.log(
      JSON.stringify({
        event: 'message_block_stream_opened',
        ...common,
        service: 'celesnity-core',
        occurredAt: new Date().toISOString(),
      }),
    );
    const abort = new AbortController();
    const closure: { reason: StreamCloseReason } = { reason: 'disconnect' };
    const stop = (next: StreamCloseReason): void => {
      if (abort.signal.aborted) return;
      // Neither consumer closure nor the rotation/shutdown deadline can
      // downgrade a failure while its final error frame is still draining.
      if (
        !['error', 'slow_consumer', 'oversized'].includes(closure.reason) ||
        ['error', 'slow_consumer', 'oversized'].includes(next)
      )
        closure.reason = next;
      connection.setCloseReason(closure.reason);
      abort.abort();
    };
    const removeDisconnectListener = connection.onDisconnect(() => stop('disconnect'));
    const shutdown = (): void => stop('shutdown');
    this.stop.add(shutdown);
    const deadline = setTimeout(() => stop('rotation'), 240_000);
    const heartbeats = this.heartbeat(connection, abort.signal, stop);
    let cursor = initialCursor;
    let deliveredBlocks = 0;
    try {
      if (!connection.start()) stop('disconnect');
      while (!abort.signal.aborted) {
        const readSlot = this.admission.acquireRead();
        if (!readSlot) {
          await delay(1_000, abort.signal);
          continue;
        }
        // A read lease remains held until the query settles, including after disconnection.
        const pending = Promise.resolve()
          .then(() => {
            abort.signal.throwIfAborted();
            return this.useCases.listByRoom(roomId, cursor, 1);
          })
          .finally(() => readSlot.release());
        const blocks = await interruptible(pending, abort.signal);
        if (abort.signal.aborted) break;
        const block = blocks[0];
        if (!block) {
          await delay(1_000, abort.signal);
          continue;
        }
        await connection.send('message_block', MessageBlockResponse.from(block), abort.signal);
        cursor = block.id;
        deliveredBlocks += 1;
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        if (error instanceof SlowSseConsumer) stop('slow_consumer');
        else if (
          error instanceof MessageBlockError &&
          error.code === 'MESSAGE_BLOCK_CURSOR_INVALID'
        ) {
          try {
            await connection.send(
              'stream_reset',
              {
                code: error.code,
                recovery: 'reload_room_state',
              },
              abort.signal,
            );
            stop('cursor_reset');
          } catch (writeError) {
            stop(writeError instanceof SlowSseConsumer ? 'slow_consumer' : 'error');
          }
        } else {
          const oversized = error instanceof OversizedSseFrame;
          closure.reason = oversized ? 'oversized' : 'error';
          connection.setCloseReason(closure.reason);
          this.logger.warn(
            JSON.stringify({
              event: 'message_block_stream_error',
              ...common,
              code: oversized ? 'FRAME_TOO_LARGE' : 'STREAM_READ_FAILED',
              errorName: error instanceof Error ? error.name : 'UnknownError',
              service: 'celesnity-core',
              occurredAt: new Date().toISOString(),
            }),
          );
          try {
            await connection.send(
              'stream_error',
              { code: oversized ? 'FRAME_TOO_LARGE' : 'STREAM_READ_FAILED', retryable: !oversized },
              abort.signal,
            );
          } catch (writeError) {
            if (writeError instanceof SlowSseConsumer) stop('slow_consumer');
          }
          stop(oversized ? 'oversized' : 'error');
        }
      }
    } finally {
      clearTimeout(deadline);
      if (!abort.signal.aborted) stop('disconnect');
      try {
        await heartbeats;
        closure.reason = await connection.finish(closure.reason);
      } catch {
        closure.reason = 'error';
        connection.setCloseReason('error');
        connection.destroy();
      } finally {
        removeDisconnectListener();
        this.stop.delete(shutdown);
        slot.release(closure.reason);
        const entry = JSON.stringify({
          event: 'message_block_stream_closed',
          ...common,
          reason: closure.reason,
          deliveredBlocks,
          durationMs: Math.round(performance.now() - startedAt),
          service: 'celesnity-core',
          occurredAt: new Date().toISOString(),
        });
        if (['error', 'slow_consumer', 'oversized'].includes(closure.reason))
          this.logger.warn(entry);
        else this.logger.log(entry);
      }
    }
  }

  private async heartbeat(
    connection: MessageBlockSseConnection,
    signal: AbortSignal,
    stop: (reason: StreamCloseReason) => void,
  ): Promise<void> {
    try {
      while (!signal.aborted) {
        await delay(15_000, signal);
        await connection.send('heartbeat', {}, signal);
      }
    } catch (error) {
      if (!signal.aborted) stop(error instanceof SlowSseConsumer ? 'slow_consumer' : 'error');
    }
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => {
      clearTimeout(timer);
      reject(new Error('Message-block subscription stopped'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}
function interruptible<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => {
      signal.removeEventListener('abort', aborted);
      reject(new Error('Message-block subscription stopped'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

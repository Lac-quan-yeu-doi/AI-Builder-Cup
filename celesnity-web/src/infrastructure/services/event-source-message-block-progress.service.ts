import type {
  MessageBlockProgressObserver,
  MessageBlockProgressService,
  MessageBlockProgressSubscription,
} from '@/src/application/services/message-block-progress.service.interface';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { MessageBlock, MessageBlockType } from '@/src/entities/models/message-block';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';

import type {
  MessageBlockCloseReason,
  MessageBlockRecoveryReason,
} from '@/src/entities/models/message-block-stream';
import {
  recordMessageBlockStreamEvent,
  type MessageBlockStreamTelemetryReason,
} from '@/src/infrastructure/observability/client-telemetry';

type MessageBlockDto = components['schemas']['MessageBlockResponse'];

export interface MessageBlockEventSourceClient {
  readonly requestId?: string;
  onopen?: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener?(
    type: 'message_block' | 'heartbeat' | 'stream_end' | 'stream_error' | 'stream_reset',
    listener: (event: MessageEvent<string>) => void,
  ): void;
  removeEventListener?(
    type: 'message_block' | 'heartbeat' | 'stream_end' | 'stream_error' | 'stream_reset',
    listener: (event: MessageEvent<string>) => void,
  ): void;
  close(): void;
}

export type MessageBlockEventSourceFactory = (url: string) => MessageBlockEventSourceClient;

export class EventSourceMessageBlockProgressService implements MessageBlockProgressService {
  public constructor(
    private readonly baseUrl: string = publicEnvironment.coreApiUrl,
    private readonly createEventSource: MessageBlockEventSourceFactory = createBrowserEventSource,
  ) {}

  public subscribe(
    roomId: string,
    observer: MessageBlockProgressObserver,
    cursor?: string,
  ): MessageBlockProgressSubscription {
    let closed = false;
    let lastCursor = cursor;
    let failures = 0;
    let resetRecoveries = 0;
    let recovering = false;
    const subscriptionId = crypto.randomUUID();
    const subscriptionStartedAt = performance.now();
    let currentRequestId: string | undefined;
    const record = (
      event:
        | 'message_block_stream_started'
        | 'message_block_stream_connected'
        | 'message_block_stream_closed'
        | 'message_block_stream_recovery'
        | 'message_block_stream_failed',
      reason?: MessageBlockStreamTelemetryReason,
      durationMs?: number,
    ) => {
      recordMessageBlockStreamEvent({
        event,
        subscriptionId,
        retryCount: failures,
        ...(currentRequestId ? { requestId: currentRequestId } : {}),
        ...(reason ? { reason } : {}),
        durationMs: durationMs ?? Math.round(performance.now() - subscriptionStartedAt),
      });
    };
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let releaseSource: (reason?: MessageBlockStreamTelemetryReason) => void = () => undefined;
    const clearWatchdog = () => {
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined;
    };
    const recoverSource = async (reason: MessageBlockRecoveryReason) => {
      if (closed || recovering) return;
      recovering = true;
      observer.onStateChange?.('reconnecting');
      record('message_block_stream_recovery', reason);
      try {
        if (reason === 'cursor_reset') {
          resetRecoveries += 1;
          lastCursor = undefined;
          if (resetRecoveries > 2 || !observer.recover) {
            observer.onStateChange?.('failed');
            record('message_block_stream_failed', 'cursor_reset_exhausted');
            observer.onError(
              translateStreamError(new Error('Message-block replay recovery exhausted')),
            );
            return;
          }
        }
        const result = observer.recover ? await observer.recover(reason, lastCursor) : undefined;
        if (closed) return;
        if (result) {
          lastCursor = result.cursor;
          // A new run may be accepted after the recovery snapshot was read.
          if (!result.resume && !observer.shouldReconnect?.()) {
            observer.onStateChange?.('paused');
            return;
          }
        }
        openSource();
      } catch (error) {
        if (!closed) failed(error);
      } finally {
        recovering = false;
      }
    };
    const schedule = (ms: number, reason?: MessageBlockRecoveryReason) => {
      if (closed || retryTimer !== undefined) return;
      observer.onStateChange?.('reconnecting');
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (reason) void recoverSource(reason);
        else openSource();
      }, ms);
    };
    const failed = (
      error: unknown,
      reason: MessageBlockStreamTelemetryReason = 'transport_error',
    ) => {
      if (closed) return;
      clearWatchdog();
      releaseSource(reason);
      failures += 1;
      const status = error instanceof MessageBlockTransportError ? error.status : undefined;
      const translated = status
        ? new CoreApiError(status, `Message block stream failed with ${status}`)
        : translateStreamError(error);
      const recoveryStatus = failureStatus(error) ?? status;
      if (
        recoveryStatus === 401 ||
        recoveryStatus === 403 ||
        recoveryStatus === 429 ||
        failures >= 5
      ) {
        record(
          'message_block_stream_failed',
          recoveryStatus === 401
            ? 'http_401'
            : recoveryStatus === 403
              ? 'http_403'
              : recoveryStatus === 429
                ? 'http_429'
                : 'retries_exhausted',
        );
        observer.onStateChange?.('failed');
        observer.onError(recoveryStatus && !status ? error : translated);
        return;
      }
      // Legacy callers without lifecycle callbacks retain their error reporting.
      if (!observer.onStateChange) observer.onError(translated);
      const delay = Math.min(1_000 * 2 ** (failures - 1), 30_000) * (0.8 + Math.random() * 0.4);
      schedule(delay, 'transport_failure');
    };
    const healthy = () => {
      failures = 0;
      observer.onStateChange?.('connected');
      clearWatchdog();
      watchdog = setTimeout(
        () => failed(new Error('Message-block heartbeat expired'), 'heartbeat_timeout'),
        45_000,
      );
    };
    const openSource = () => {
      if (closed) return;
      let source: MessageBlockEventSourceClient;
      try {
        const query = lastCursor ? `?cursor=${encodeURIComponent(lastCursor)}` : '';
        source = this.createEventSource(
          `${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/message-blocks/stream${query}`,
        );
      } catch (error) {
        failed(error);
        return;
      }
      const startedAt = performance.now();
      currentRequestId = source.requestId;
      record('message_block_stream_started');
      let active = true;
      let rotation = false;
      let reset = false;
      const handleBlock = (message: MessageEvent<string>) => {
        if (closed || !active) return;
        const block = parseBlock(message.data);
        if (!block || block.roomId !== roomId) return;
        observer.onBlock(block);
        resetRecoveries = 0;
        lastCursor = block.id;
        healthy();
      };
      const heartbeat = () => {
        if (!closed && active) healthy();
      };
      const ending = () => {
        if (!closed && active) {
          rotation = true;
          clearWatchdog();
          // A truncated final response cannot leave the subscriber stuck in an ending state.
          watchdog = setTimeout(() => source.onerror?.(new Event('error')), 10_000);
        }
      };
      const streamError = (message: MessageEvent<string>) => {
        if (closed || !active) return;
        let data: { retryable?: boolean; code?: string };
        try {
          data = JSON.parse(message.data) as typeof data;
        } catch {
          failed(new Error('Invalid stream error'));
          return;
        }
        if (data.retryable !== false) {
          failed(new Error(data.code ?? 'Stream error'));
          return;
        }
        clearWatchdog();
        releaseSource('non_retryable_error');
        record('message_block_stream_failed', 'non_retryable_error');
        observer.onStateChange?.('failed');
        observer.onError(translateStreamError(new Error(data.code ?? 'Stream error')));
      };
      const streamReset = (message: MessageEvent<string>) => {
        if (closed || !active || reset) return;
        try {
          const data = JSON.parse(message.data) as { code?: string; recovery?: string };
          if (data.code !== 'MESSAGE_BLOCK_CURSOR_INVALID' || data.recovery !== 'reload_room_state')
            throw new Error('Invalid reset event');
          reset = true;
          clearWatchdog();
          watchdog = setTimeout(() => source.onerror?.(new Event('error')), 10_000);
        } catch (error) {
          failed(error);
        }
      };
      const listeners = {
        message_block: handleBlock,
        heartbeat,
        stream_end: ending,
        stream_error: streamError,
        stream_reset: streamReset,
      };
      releaseSource = (reason = 'replacement') => {
        if (!active) return;
        active = false;
        currentRequestId = source.requestId;
        record('message_block_stream_closed', reason, Math.round(performance.now() - startedAt));
        for (const [name, listener] of Object.entries(listeners))
          source.removeEventListener?.(name as keyof typeof listeners, listener);
        source.onopen = null;
        source.onmessage = null;
        source.onerror = null;
        source.close();
      };
      for (const [name, listener] of Object.entries(listeners))
        source.addEventListener?.(name as keyof typeof listeners, listener);
      source.onopen = () => {
        if (!closed && active) {
          currentRequestId = source.requestId;
          record('message_block_stream_connected');
          observer.onStateChange?.('connected');
        }
      };
      source.onmessage = handleBlock;
      source.onerror = (error) => {
        if (closed || !active) return;
        clearWatchdog();
        releaseSource(reset ? 'cursor_reset' : rotation ? 'rotation' : 'transport_error');
        if (reset) {
          void recoverSource('cursor_reset');
        } else if (rotation) {
          if (observer.shouldReconnect?.()) schedule(500 + Math.random() * 1_000);
          else observer.onStateChange?.('paused');
        } else failed(error);
      };
      watchdog = setTimeout(
        () => failed(new Error('Message-block heartbeat expired'), 'heartbeat_timeout'),
        45_000,
      );
    };
    openSource();
    return {
      close: (reason?: MessageBlockCloseReason) => {
        if (closed) return;
        closed = true;
        clearWatchdog();
        if (retryTimer !== undefined) clearTimeout(retryTimer);
        releaseSource(
          reason && ['unmount', 'room_change', 'replacement', 'manual_reconnect'].includes(reason)
            ? reason
            : 'replacement',
        );
      },
    };
  }
}

/** Fetch-based SSE exposes HTTP auth/capacity status, which native EventSource hides. */
export class MessageBlockTransportError extends Event {
  public constructor(public readonly status?: number) {
    super('error');
  }
}
function createBrowserEventSource(url: string): MessageBlockEventSourceClient {
  const abort = new AbortController();
  let requestId = crypto.randomUUID();
  const listeners = new Map<string, (event: MessageEvent<string>) => void>();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const source: MessageBlockEventSourceClient = {
    get requestId() {
      return requestId;
    },
    onmessage: null,
    onerror: null,
    addEventListener: (name, listener) => {
      listeners.set(name, listener);
    },
    removeEventListener: (name) => {
      listeners.delete(name);
    },
    close: () => {
      abort.abort();
      void reader?.cancel().catch(() => undefined);
      listeners.clear();
    },
  };
  void (async () => {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'text/event-stream', 'X-Request-Id': requestId },
        cache: 'no-store',
        signal: abort.signal,
      });
      requestId = response.headers.get('X-Request-Id') ?? requestId;
      if (!response.ok) {
        await response.body?.cancel();
        source.onerror?.(new MessageBlockTransportError(response.status));
        return;
      }
      if (!response.body) throw new Error('Empty SSE response');
      source.onopen?.(new Event('open'));
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Core emits LF frames. Normalize CRLF for compatible SSE servers.
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let name = 'message';
          const data: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) name = line.slice(6).trim();
            if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          const event = new MessageEvent<string>(name, { data: data.join('\n') });
          if (name === 'message') source.onmessage?.(event);
          else listeners.get(name)?.(event);
          if (abort.signal.aborted) break;
        }
        if (buffer.length > 1_048_576) throw new Error('SSE frame exceeds the transport limit');
      }
      if (!abort.signal.aborted) source.onerror?.(new MessageBlockTransportError());
    } catch {
      if (!abort.signal.aborted) source.onerror?.(new MessageBlockTransportError());
    } finally {
      reader?.releaseLock();
    }
  })();
  return source;
}

function parseBlock(raw: string): MessageBlock | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isMessageBlockDto(parsed)) {
    return undefined;
  }
  return {
    id: parsed.id,
    roomId: parsed.room_id,
    runId: parsed.run_id,
    blockType: parsed.block_type as MessageBlockType,
    version: parsed.version,
    payload: parsed.payload,
    fallbackText: parsed.fallback_text,
    publishedAt: parsed.published_at,
  };
}

function isMessageBlockDto(value: unknown): value is MessageBlockDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.room_id === 'string' &&
    (candidate.run_id === null || typeof candidate.run_id === 'string') &&
    typeof candidate.block_type === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null &&
    typeof candidate.fallback_text === 'string' &&
    typeof candidate.published_at === 'string'
  );
}

function translateStreamError(error: unknown): RemoteServiceError {
  return new RemoteServiceError(
    error instanceof Error ? error.message : 'The message block stream failed.',
    { cause: error },
  );
}

function failureStatus(error: unknown): number | undefined {
  let cause = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth += 1) {
    if ('status' in cause && typeof cause.status === 'number') return cause.status;
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return undefined;
}

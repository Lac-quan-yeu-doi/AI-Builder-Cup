import type {
  MessageBlockCloseReason,
  MessageBlockRecoveryReason,
} from '@/src/entities/models/message-block-stream';

export type CoreApiTelemetryEvent =
  | {
      readonly event: 'core_api_request_started';
      readonly method: string;
      readonly requestId: string;
      readonly route: string;
    }
  | {
      readonly backendRequestId?: string;
      readonly durationMs: number;
      readonly event: 'core_api_request_completed';
      readonly method: string;
      readonly requestId: string;
      readonly route: string;
      readonly status: number;
    }
  | {
      readonly backendRequestId?: string;
      readonly durationMs: number;
      readonly error: string;
      readonly event: 'core_api_request_failed';
      readonly method: string;
      readonly requestId: string;
      readonly route: string;
      readonly status?: number;
    };

export function recordCoreApiEvent(event: CoreApiTelemetryEvent): void {
  recordClientEvent(event, event.event === 'core_api_request_failed');
}

export type MessageBlockStreamTelemetryReason =
  | MessageBlockCloseReason
  | MessageBlockRecoveryReason
  | 'rotation'
  | 'transport_error'
  | 'heartbeat_timeout'
  | 'non_retryable_error'
  | 'cursor_reset_exhausted'
  | 'retries_exhausted'
  | 'http_401'
  | 'http_403'
  | 'http_429';

export interface MessageBlockStreamTelemetryEvent {
  readonly event:
    | 'message_block_stream_started'
    | 'message_block_stream_connected'
    | 'message_block_stream_closed'
    | 'message_block_stream_recovery'
    | 'message_block_stream_failed';
  readonly subscriptionId: string;
  readonly requestId?: string;
  readonly reason?: MessageBlockStreamTelemetryReason;
  readonly durationMs?: number;
  readonly retryCount: number;
}

export function recordMessageBlockStreamEvent(event: MessageBlockStreamTelemetryEvent): void {
  recordClientEvent(event, event.event === 'message_block_stream_failed');
}

function recordClientEvent(
  event: CoreApiTelemetryEvent | MessageBlockStreamTelemetryEvent,
  failed: boolean,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    ...event,
    occurredAt: new Date().toISOString(),
    page: window.location.pathname,
  };

  if ('method' in event && event.event === 'core_api_request_failed') {
    // The message carries the facts rather than leaving them in the object:
    // Next's dev overlay renders a logged object as `{}`, so a failed request
    // announced itself as `[CoreApi] {}` and said nothing at all.
    const status = event.status === undefined ? '' : ` ${event.status}`;
    console.error(
      `[CoreApi] ${event.method} ${event.route} failed${status}: ${event.error}`,
      payload,
    );
  } else if ('method' in event) {
    console.info(`[CoreApi] ${event.method} ${event.route}`, payload);
  } else if (failed) {
    console.warn('[MessageBlockStream]', payload);
  } else {
    console.info('[MessageBlockStream]', payload);
  }

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon('/api/client-logs', new Blob([body], { type: 'application/json' }))) {
      return;
    }
  } catch {
    // Fall through to fetch when sendBeacon is unavailable or rejects the payload.
  }

  void fetch('/api/client-logs', {
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
}

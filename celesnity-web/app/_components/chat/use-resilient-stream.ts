/**
 * Resilient SSE stream manager.
 *
 * Provides automatic reconnection with exponential backoff, sequence tracking
 * for gap-free resumption, and connection status reporting. Designed to work
 * with `parseSseStream` and the minder-agent room events endpoint which
 * supports v2 `?cursor=` resumption.
 */

export type StreamConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface ResilientStreamConfig {
  /** Initial delay before the first retry attempt (ms). Default: 1000 */
  readonly baseDelayMs: number;
  /** Maximum backoff delay (ms). Default: 30000 */
  readonly maxDelayMs: number;
  /** Maximum number of consecutive retries before giving up. Default: Infinity */
  readonly maxRetries: number;
  /** Jitter factor applied to the delay (0–1). Default: 0.3 */
  readonly jitterFactor: number;
}

const DEFAULT_CONFIG: ResilientStreamConfig = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxRetries: Infinity,
  jitterFactor: 0.3,
};

export interface ResilientStreamHandle {
  /** Attempt to connect (or reconnect) and return a stream. Automatically
   *  retries on failure with exponential backoff until `maxRetries` or the
   *  abort signal fires. */
  readonly connect: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
  /** Record the most recently received sequence id. The next `connect` call
   *  will pass this to the factory so the server can resume from this point. */
  readonly updateLastSeq: (seq: string) => void;
  /** Subscribe to status transitions. Returns an unsubscribe function. */
  readonly onStatusChange: (listener: (status: StreamConnectionStatus) => void) => () => void;
  /** Reset retry counter (e.g. after a successful stream ends gracefully). */
  readonly resetRetries: () => void;
  /** Wait before retrying after an already-open stream closes unexpectedly. */
  readonly waitBeforeReconnect: (signal: AbortSignal) => Promise<void>;
  /** Current connection status. */
  readonly getStatus: () => StreamConnectionStatus;
}

/**
 * Creates a resilient stream handle. The `factory` receives the last known
 * event ID (if any) so it can pass the v2 `?cursor=` to the server.
 */
export function createResilientStream(
  factory: (
    lastSeq: string | undefined,
    signal: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array>>,
  config: Partial<ResilientStreamConfig> = {},
): ResilientStreamHandle {
  const cfg: ResilientStreamConfig = { ...DEFAULT_CONFIG, ...config };

  let retryCount = 0;
  let streamReconnectCount = 0;
  let lastSeq: string | undefined;
  let status: StreamConnectionStatus = 'disconnected';
  const listeners = new Set<(s: StreamConnectionStatus) => void>();

  function setStatus(next: StreamConnectionStatus): void {
    if (next === status) return;
    status = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // Listener errors must never break the retry loop.
      }
    }
  }

  async function connect(signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    while (!signal.aborted) {
      try {
        const stream = await factory(lastSeq, signal);
        retryCount = 0;
        setStatus('connected');
        return stream;
      } catch (err: unknown) {
        if (signal.aborted) break;

        retryCount += 1;
        setStatus('reconnecting');

        if (retryCount > cfg.maxRetries) {
          setStatus('disconnected');
          throw new Error(
            `Resilient stream: max retries (${cfg.maxRetries}) exceeded. Last error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        const exponentialDelay = Math.min(cfg.baseDelayMs * 2 ** (retryCount - 1), cfg.maxDelayMs);
        const jitter = exponentialDelay * cfg.jitterFactor * (Math.random() * 2 - 1);
        const delay = Math.max(0, exponentialDelay + jitter);

        await sleep(delay, signal);
      }
    }

    throw new DOMException('Resilient stream connect aborted', 'AbortError');
  }

  function updateLastSeq(seq: string): void {
    lastSeq = seq;
  }

  function onStatusChange(listener: (s: StreamConnectionStatus) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function resetRetries(): void {
    retryCount = 0;
    streamReconnectCount = 0;
  }

  async function waitBeforeReconnect(signal: AbortSignal): Promise<void> {
    streamReconnectCount += 1;
    const exponentialDelay = Math.min(
      cfg.baseDelayMs * 2 ** (streamReconnectCount - 1),
      cfg.maxDelayMs,
    );
    const jitter = exponentialDelay * cfg.jitterFactor * (Math.random() * 2 - 1);
    await sleep(Math.max(0, exponentialDelay + jitter), signal);
  }

  function getStatus(): StreamConnectionStatus {
    return status;
  }

  return {
    connect,
    updateLastSeq,
    onStatusChange,
    resetRetries,
    waitBeforeReconnect,
    getStatus,
  };
}

/** Sleeps for `ms` milliseconds, rejecting early if `signal` fires. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Sleep aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Sleep aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

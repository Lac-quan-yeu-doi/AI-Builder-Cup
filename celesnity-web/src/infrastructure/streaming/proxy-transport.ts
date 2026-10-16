/** Identity slots are allocated only after the route verifies the session cookie. */
export class MessageBlockProxyAdmission {
  private active = 0;
  private readonly subjects = new Map<string, number>();
  private readonly rejections = { pod: 0, subject: 0 };
  private readonly closes = { completed: 0, disconnected: 0, error: 0, shutdown: 0 };

  public constructor(
    private readonly record: (value: Record<string, unknown>) => void = () => undefined,
  ) {}

  public acquire(subject: string): (() => void) | 'pod' | 'subject' {
    const scope =
      this.active >= 64 ? 'pod' : (this.subjects.get(subject) ?? 0) >= 8 ? 'subject' : undefined;
    if (scope) {
      this.rejections[scope] += 1;
      this.record({ event: 'message_block_proxy_rejected', scope, ...this.snapshot() });
      return scope;
    }
    this.active += 1;
    this.subjects.set(subject, (this.subjects.get(subject) ?? 0) + 1);
    this.record({ event: 'message_block_proxy_opened', ...this.snapshot() });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const remaining = (this.subjects.get(subject) ?? 1) - 1;
      if (remaining === 0) this.subjects.delete(subject);
      else this.subjects.set(subject, remaining);
    };
  }
  public closed(reason: keyof typeof this.closes): void {
    this.closes[reason] += 1;
    this.record({ event: 'message_block_proxy_closed', reason, ...this.snapshot() });
  }
  public snapshot() {
    return { active: this.active, rejections: { ...this.rejections }, closes: { ...this.closes } };
  }
}
type ProxyCloseReason = 'completed' | 'disconnected' | 'error' | 'shutdown';
interface ProxyProcessState {
  admission: MessageBlockProxyAdmission;
  transports: Set<() => void>;
  stopping: boolean;
  installed: boolean;
}
// Next can load routes in separate bundles. Share quota and shutdown state across those bundles.
const processGlobal = globalThis as typeof globalThis & {
  __celesnityProxyStreams?: ProxyProcessState;
};
const state = (processGlobal.__celesnityProxyStreams ??= {
  admission: new MessageBlockProxyAdmission((value) => console.info(JSON.stringify(value))),
  transports: new Set<() => void>(),
  stopping: false,
  installed: false,
});
export const messageBlockProxyAdmission = state.admission;

export function cancelProxyTransports(): void {
  for (const cancel of state.transports) cancel();
}
function shuttingDown(): void {
  state.stopping = true;
  cancelProxyTransports();
}
if (!state.installed && typeof process !== 'undefined' && process.release?.name === 'node') {
  state.installed = true;
  // Release leases before Next's termination handler exits the process.
  process.prependListener('SIGTERM', shuttingDown);
  process.prependListener('SIGINT', shuttingDown);
}

/** One upstream reader, pull-based byte reads, and a bounded downstream queue. */
export function createProxyTransport(
  signal: AbortSignal,
  release: () => void = () => undefined,
  recordClose: (reason: ProxyCloseReason) => void = () => undefined,
  bounded = false,
  onFinish: (reason: ProxyCloseReason) => void = () => undefined,
) {
  const abort = new AbortController();
  let reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader<Uint8Array> | undefined;
  let byteReads = true;
  let downstream: ReadableStreamController<Uint8Array> | undefined;
  let finished = false;
  const finish = (reason: ProxyCloseReason) => {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', disconnected);
    state.transports.delete(shutdown);
    if (reason !== 'completed') abort.abort();
    const upstreamReader = reader;
    void upstreamReader
      ?.cancel()
      .catch(() => undefined)
      .finally(() => upstreamReader.releaseLock());
    release();
    recordClose(reason);
    try {
      onFinish(reason);
    } catch {
      // Observability must not interrupt stream cleanup.
    }
  };
  const closeDownstream = (reason: 'disconnected' | 'shutdown') => {
    finish(reason);
    try {
      downstream?.error(new DOMException('Downstream disconnected', 'AbortError'));
    } catch {
      /* already closed */
    }
  };
  const disconnected = () => closeDownstream('disconnected');
  const shutdown = () => closeDownstream('shutdown');
  state.transports.add(shutdown);
  signal.addEventListener('abort', disconnected, { once: true });
  if (state.stopping) shutdown();
  else if (signal.aborted) disconnected();
  return {
    signal: abort.signal,
    finish,
    relay(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> | null {
      if (body === null) {
        finish('completed');
        return null;
      }
      // Node fetch exposes a byte stream. BYOB bounds each read as well as the queue.
      try {
        reader = body.getReader({ mode: 'byob' });
      } catch (error) {
        if (bounded) {
          finish('error');
          void body.cancel().catch(() => undefined);
          throw error;
        }
        byteReads = false;
        reader = body.getReader();
      }
      if (finished) {
        const upstreamReader = reader;
        void upstreamReader
          .cancel()
          .catch(() => undefined)
          .finally(() => upstreamReader.releaseLock());
        return null;
      }
      return new ReadableStream<Uint8Array>(
        {
          type: 'bytes',
          start(controller) {
            downstream = controller;
          },
          async pull(controller) {
            if (finished) return;
            try {
              const result = byteReads
                ? await (reader as ReadableStreamBYOBReader).read(new Uint8Array(16 * 1024))
                : await (reader as ReadableStreamDefaultReader<Uint8Array>).read();
              if (finished) return;
              if (!result || result.done) {
                controller.close();
                finish('completed');
                return;
              }
              controller.enqueue(
                byteReads
                  ? (result.value as Uint8Array<ArrayBuffer>)
                  : new Uint8Array(result.value),
              );
            } catch (error) {
              if (!finished) {
                controller.error(error);
                finish('error');
              }
            }
          },
          cancel() {
            finish('disconnected');
          },
        },
        { highWaterMark: 48 * 1024 },
      );
    },
  };
}

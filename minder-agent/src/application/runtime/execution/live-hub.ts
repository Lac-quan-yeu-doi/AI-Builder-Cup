import type { EventEnvelope, RuntimeSubscription } from "./types.js";

const CAPACITY = 256;

export class LiveEventHub {
  private readonly entries = new Map<string, Set<Subscription>>();
  private readonly closed = new Set<string>();

  open(runId: string): void {
    if (!this.closed.has(runId)) this.entries.set(runId, new Set());
  }

  subscribe(runId: string): RuntimeSubscription | undefined {
    if (this.closed.has(runId) || !this.entries.has(runId)) return undefined;
    const subscription = new Subscription(() =>
      this.remove(runId, subscription),
    );
    this.entries.get(runId)!.add(subscription);
    return subscription;
  }

  publish(envelope: EventEnvelope): void {
    for (const subscription of this.entries.get(envelope.runId) ?? [])
      subscription.push(envelope);
  }

  close(runId: string): void {
    if (this.closed.has(runId)) return;
    this.closed.add(runId);
    for (const subscription of this.entries.get(runId) ?? [])
      subscription.finish();
    this.entries.delete(runId);
  }

  private remove(runId: string, subscription: Subscription): void {
    this.entries.get(runId)?.delete(subscription);
  }
}

class Subscription implements RuntimeSubscription {
  private readonly queue: EventEnvelope[] = [];
  private readonly waiters: Array<
    (value: EventEnvelope | "resync" | "closed") => void
  > = [];
  private resync = false;
  private closed = false;

  constructor(private readonly onClose: () => void) {}

  push(envelope: EventEnvelope): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(structuredClone(envelope));
      return;
    }
    if (this.queue.length >= CAPACITY) {
      this.queue.length = 0;
      this.resync = true;
      return;
    }
    this.queue.push(structuredClone(envelope));
  }

  next(signal: AbortSignal): Promise<EventEnvelope | "resync" | "closed"> {
    if (signal.aborted) return Promise.reject(abortError());
    if (this.resync) {
      this.resync = false;
      return Promise.resolve("resync");
    }
    const value = this.queue.shift();
    if (value) return Promise.resolve(value);
    if (this.closed) return Promise.resolve("closed");
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener("abort", onAbort);
        const index = this.waiters.indexOf(resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.waiters.push((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      });
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    for (const waiter of this.waiters.splice(0)) waiter("closed");
    this.onClose();
  }

  finish(): void {
    this.close();
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

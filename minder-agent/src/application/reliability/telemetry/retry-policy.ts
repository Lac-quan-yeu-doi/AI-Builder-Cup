import type { ChatCompletionGateway } from "@application/shared/ports/index.js";

export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly signal?: AbortSignal;
}

export function withTransientStreamRetries(
  gateway: ChatCompletionGateway,
  options: RetryOptions = {},
): ChatCompletionGateway {
  return {
    stream: (request, signal) =>
      retryStream(() => gateway.stream(request, signal), options, signal),
  };
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const baseDelayMs = Math.max(0, Math.min(options.baseDelayMs ?? 100, 2_000));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt >= maxAttempts) throw error;
      if (options.signal?.aborted)
        throw new Error("Retry interrupted.", { cause: error });
      await delay(baseDelayMs * 2 ** (attempt - 1), options.signal);
    }
  }
}

async function* retryStream<T>(
  create: () => AsyncIterable<T>,
  options: RetryOptions,
  signal: AbortSignal,
): AsyncGenerator<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const baseDelayMs = Math.max(0, Math.min(options.baseDelayMs ?? 100, 2_000));
  for (let attempt = 1; ; attempt += 1) {
    let emitted = false;
    try {
      for await (const value of create()) {
        emitted = true;
        yield value;
      }
      return;
    } catch (error) {
      if (emitted || !retryable(error) || attempt >= maxAttempts) throw error;
      if (signal.aborted)
        throw new Error("Retry interrupted.", { cause: error });
      await delay(baseDelayMs * 2 ** (attempt - 1), signal);
    }
  }
}

function retryable(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  if (
    typeof status === "number" &&
    [408, 425, 429, 502, 503, 504].includes(status)
  )
    return true;
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return [
    "timeout",
    "timed out",
    "connection reset",
    "connection refused",
    "temporarily unavailable",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "rate limit",
    "too many requests",
    "overloaded",
  ].some((pattern) => message.includes(pattern));
}

async function delay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (milliseconds === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Retry interrupted."));
      },
      { once: true },
    );
  });
}

import type { ChatCompletionGateway } from "./types.js";

export interface RetryClassification {
  readonly retryable: boolean;
  readonly reason: string;
  readonly status?: number;
}

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
    stream(request, signal) {
      return retryStream(
        () => gateway.stream(request, signal),
        options,
        signal,
      );
    },
  };
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export function classifyRetryable(error: unknown): RetryClassification {
  const status = statusOf(error);
  if (status !== undefined && TRANSIENT_STATUSES.has(status))
    return {
      retryable: true,
      reason: `transient HTTP status ${status}`,
      status,
    };
  const message = messageOf(error).toLowerCase();
  if (
    [
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
    ].some((pattern) => message.includes(pattern))
  )
    return {
      retryable: true,
      reason: "transient transport failure",
      ...(status === undefined ? {} : { status }),
    };
  return {
    retryable: false,
    reason: "non-retryable failure",
    ...(status === undefined ? {} : { status }),
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
      const classification = classifyRetryable(error);
      if (!classification.retryable || attempt >= maxAttempts) throw error;
      if (options.signal?.aborted)
        throw new Error("Retry interrupted.", { cause: error });
      await delay(baseDelayMs * 2 ** (attempt - 1), options.signal);
    }
  }
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
      const classification = classifyRetryable(error);
      if (emitted || !classification.retryable || attempt >= maxAttempts)
        throw error;
      if (signal.aborted)
        throw new Error("Retry interrupted.", { cause: error });
      await delay(baseDelayMs * 2 ** (attempt - 1), signal);
    }
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

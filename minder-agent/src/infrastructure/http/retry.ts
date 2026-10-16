export interface RetryPolicyOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly isRetryable?: (error: unknown) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Bounded exponential-backoff retry policy. Retries up to `maxAttempts` and
 * rethrows the last error when exhausted. An aborted signal stops retries
 * immediately so cancellation cannot be starved by backoff.
 *
 * Ported from the Rust provider retry behavior.
 */
export class RetryPolicy {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RetryPolicyOptions) {
    if (options.maxAttempts < 1)
      throw new Error("maxAttempts must be at least one.");
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async run<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      if (signal?.aborted) throw abortError();
      try {
        return await request();
      } catch (error) {
        lastError = error;
        const retryable = this.options.isRetryable
          ? this.options.isRetryable(error)
          : true;
        if (
          !retryable ||
          attempt >= this.options.maxAttempts ||
          signal?.aborted
        )
          throw error;
        await this.sleep(this.options.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

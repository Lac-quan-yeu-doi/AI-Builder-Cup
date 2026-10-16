export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
  readonly now?: () => number;
}

type CircuitState = "closed" | "open" | "half_open";

/**
 * A minimal circuit breaker. After `failureThreshold` consecutive failures the
 * circuit opens and calls fail fast with `circuit_open` until `cooldownMs`
 * elapses, after which a single trial call is allowed (half-open). A success
 * closes the circuit; a failure re-opens it.
 *
 * Ported from the Rust provider circuit-breaker behavior; Minder owns the error
 * shape and never records provider credentials.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    if (options.failureThreshold < 1)
      throw new Error("failureThreshold must be at least one.");
    this.now = options.now ?? (() => Date.now());
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.now() - this.openedAt < this.options.cooldownMs)
        throw new Error("circuit_open");
      this.state = "half_open";
    }
    try {
      const result = await request();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (
      this.state === "half_open" ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}

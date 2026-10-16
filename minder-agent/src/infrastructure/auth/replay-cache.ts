export class AssertionAuthenticationError extends Error {
  public constructor(
    public readonly code:
      "unauthenticated" | "assertion_replayed" | "auth_capacity_unavailable",
  ) {
    super(code);
    this.name = "AssertionAuthenticationError";
  }
}

export interface AssertionReplayCache {
  consume(
    jti: string,
    expiresAt: number,
    nowSeconds: number,
  ): void | Promise<void>;
}

/** A bounded cache deliberately never evicts a live assertion before expiry. */
export class InMemoryAssertionReplayCache implements AssertionReplayCache {
  private readonly consumed = new Map<string, number>();

  public constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(
        "Assertion replay cache capacity must be a positive integer.",
      );
    }
  }

  public consume(jti: string, expiresAt: number, nowSeconds: number): void {
    for (const [knownJti, knownExpiry] of this.consumed) {
      if (knownExpiry <= nowSeconds) this.consumed.delete(knownJti);
    }
    if (this.consumed.has(jti))
      throw new AssertionAuthenticationError("assertion_replayed");
    if (this.consumed.size >= this.capacity) {
      throw new AssertionAuthenticationError("auth_capacity_unavailable");
    }
    this.consumed.set(jti, expiresAt);
  }
}

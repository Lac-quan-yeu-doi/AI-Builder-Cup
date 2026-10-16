import { describe, expect, it, vi } from "vitest";
import { RetryPolicy } from "@infrastructure/http/index.js";

describe("RetryPolicy", () => {
  it("retries a retryable failure then succeeds", async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 0 });
    let attempts = 0;
    const result = await policy.run(async () => {
      attempts += 1;
      if (attempts < 2) throw new Error("temporary");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("stops after maxAttempts and rethrows the last error", async () => {
    const policy = new RetryPolicy({ maxAttempts: 2, baseDelayMs: 0 });
    let attempts = 0;
    await expect(
      policy.run(async () => {
        attempts += 1;
        throw new Error("always");
      }),
    ).rejects.toThrow("always");
    expect(attempts).toBe(2);
  });

  it("does not retry once the signal is aborted", async () => {
    const controller = new AbortController();
    const policy = new RetryPolicy({ maxAttempts: 5, baseDelayMs: 0 });
    const request = vi.fn(async () => {
      controller.abort();
      throw new Error("temporary");
    });
    await expect(policy.run(request, controller.signal)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

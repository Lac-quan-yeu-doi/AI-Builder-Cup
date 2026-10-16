import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "@infrastructure/http/index.js";

describe("CircuitBreaker", () => {
  it("opens the circuit after the configured consecutive failures", async () => {
    const clock = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1_000,
      now: () => clock,
    });
    const failingRequest = async (): Promise<never> => {
      throw new Error("boom");
    };

    await expect(breaker.run(failingRequest)).rejects.toThrow("boom");
    await expect(breaker.run(failingRequest)).rejects.toThrow("boom");
    // Circuit is now open; further calls fail fast without running the request.
    await expect(breaker.run(failingRequest)).rejects.toThrow("circuit_open");
  });

  it("half-opens after the cooldown and closes on success", async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: () => clock,
    });
    await expect(
      breaker.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(breaker.run(async () => "ok")).rejects.toThrow("circuit_open");

    clock = 1_001;
    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
    // A closed circuit keeps serving.
    await expect(breaker.run(async () => "again")).resolves.toBe("again");
  });
});

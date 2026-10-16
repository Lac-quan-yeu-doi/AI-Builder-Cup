import { describe, expect, it } from "vitest";
import { NoopTelemetry } from "@infrastructure/observability";

describe("observability contracts", () => {
  it("offers a safe no-op adapter", async () => {
    const telemetry = new NoopTelemetry();
    await expect(
      telemetry.record({ name: "event", data: null }),
    ).resolves.toBeUndefined();
  });
});

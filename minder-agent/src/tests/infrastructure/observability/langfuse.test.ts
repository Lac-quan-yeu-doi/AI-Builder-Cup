import type { TelemetryPort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  FailOpenTelemetry,
  createLangfuseTelemetry,
} from "@infrastructure/observability/index.js";

describe("Langfuse telemetry", () => {
  it("builds a telemetry port from configuration without contacting a provider", async () => {
    const telemetry = createLangfuseTelemetry({
      baseUrl: "https://cloud.langfuse.test",
      publicKey: "pk",
      secretKey: "super-secret-token",
    });
    const trace = await telemetry.startRun({
      runId: "run-1" as never,
      name: "run",
    });
    expect(trace).toMatchObject({ traceId: expect.any(String) });
  });

  it("finishes a run when the underlying telemetry rejects", async () => {
    const rejecting: TelemetryPort = {
      async startRun() {
        throw new Error("telemetry down");
      },
      async record() {
        throw new Error("telemetry down");
      },
      async finishRun() {
        throw new Error("telemetry down");
      },
    };
    const telemetry = new FailOpenTelemetry(rejecting);
    // None of these throw despite the delegate always rejecting.
    const trace = await telemetry.startRun({
      runId: "run-1" as never,
      name: "run",
    });
    await telemetry.record({ name: "step", data: {} });
    await telemetry.finishRun({ runId: "run-1" as never, success: true });
    expect(trace).toMatchObject({ traceId: "noop" });
  });
});

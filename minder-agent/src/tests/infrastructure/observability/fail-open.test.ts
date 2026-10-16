import type { TelemetryPort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  FailOpenTelemetry,
  failOpen,
} from "@infrastructure/observability/index.js";

const failing: TelemetryPort = {
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

describe("FailOpenTelemetry", () => {
  it("never throws when the underlying telemetry rejects", async () => {
    const telemetry = new FailOpenTelemetry(failing);
    const trace = await telemetry.startRun({
      runId: "run-1" as never,
      name: "run",
    });
    await telemetry.record({ name: "step", data: {} });
    await telemetry.finishRun({ runId: "run-1" as never, success: true });
    expect(trace).toMatchObject({ traceId: "noop" });
  });

  it("finishes a run when telemetry finalization rejects", async () => {
    // Simulate a run finalization that fires telemetry through failOpen: the
    // run outcome stays "completed" even though the telemetry call rejects.
    let status: "completed" | "failed" = "failed";
    const finalize = async (): Promise<void> => {
      status = "completed";
      await failOpen(() =>
        failing.finishRun({ runId: "run-1" as never, success: true }),
      );
    };
    await expect(finalize()).resolves.toBeUndefined();
    expect(status).toBe("completed");
  });
});

import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import type { TelemetryPort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  InMemoryRunManager,
  InMemoryRuntimeStore,
  RuntimeRunManager,
} from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function gateway(): ChatCompletionGateway {
  return {
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      yield { type: "text", text: "complete" };
    },
  };
}

async function waitForRun(
  manager: InMemoryRunManager | RuntimeRunManager,
  runId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await manager.store.getRun(runId);
    if (run && ["completed", "failed", "interrupted"].includes(run.status)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("run did not finish");
}

function recordingTelemetry(events: string[]): TelemetryPort {
  return {
    async startRun(input) {
      events.push(`start:${input.runId}`);
      return { traceId: "trace", spanId: "span" };
    },
    async record(event) {
      events.push(`event:${event.name}`);
    },
    async finishRun(input) {
      events.push(`finish:${input.runId}:${input.success}`);
    },
  };
}

describe.each([
  [
    "in-memory",
    () =>
      new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway(),
      }),
  ],
  [
    "runtime",
    () =>
      new RuntimeRunManager({
        config,
        sha256,
        store: new InMemoryRuntimeStore(),
        gateway: gateway(),
      }),
  ],
])("runtime telemetry (%s)", (_name, createManager) => {
  it("records start, lifecycle events, and finish", async () => {
    const events: string[] = [];
    const manager = createManager();
    const configured =
      manager instanceof InMemoryRunManager
        ? new InMemoryRunManager({
            sha256,
            config,
            gateway: gateway(),
            telemetry: recordingTelemetry(events),
          })
        : new RuntimeRunManager({
            config,
            sha256,
            store: new InMemoryRuntimeStore(),
            gateway: gateway(),
            telemetry: recordingTelemetry(events),
          });
    void manager;
    const admission = await configured.start({
      key: "telemetry-test",
      input: "finish",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "test" },
    });
    if (admission.kind !== "started") throw new Error("expected admission");
    await waitForRun(configured, admission.run.id);
    expect(events.some((event) => event.startsWith("start:"))).toBe(true);
    expect(events).toContain("event:text");
    expect(events.some((event) => event.startsWith("finish:"))).toBe(true);
  });

  it("does not fail a run when telemetry rejects", async () => {
    const manager = createManager();
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
    const configured =
      manager instanceof InMemoryRunManager
        ? new InMemoryRunManager({
            sha256,
            config,
            gateway: gateway(),
            telemetry: rejecting,
          })
        : new RuntimeRunManager({
            config,
            sha256,
            store: new InMemoryRuntimeStore(),
            gateway: gateway(),
            telemetry: rejecting,
          });
    void manager;
    await expect(
      configured.start({
        key: "telemetry-failure-test",
        input: "finish",
        owner: "alice",
        mode: "interactive",
        trigger: { source: "test" },
      }),
    ).resolves.toMatchObject({ kind: "started" });
  });
});

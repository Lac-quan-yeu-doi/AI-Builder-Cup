import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { ToolRegistry } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { InMemoryRuntimeStore, RuntimeRunManager } from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test",
  model: "test",
};

async function waitFor(
  store: InMemoryRuntimeStore,
  runId: string,
  status: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = store.getRun(runId);
    if (run?.status === status) return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not reach ${status}`);
}

describe("RuntimeRunManager plan resume", () => {
  it("continues the paused loop after approval", async () => {
    let index = 0;
    const scripts: readonly (readonly ModelStreamEvent[])[] = [
      [
        {
          type: "tool_call",
          call: {
            id: "plan-1",
            name: "ProposePlan",
            arguments: JSON.stringify({
              summary: "Prepare the report",
              steps: [
                { tool_name: "Write", arguments: {}, rationale: "Write it." },
              ],
            }),
          },
        },
      ],
      [{ type: "text", text: "Report prepared." }],
    ];
    const gateway: ChatCompletionGateway = {
      async *stream() {
        yield* scripts[index++] ?? [];
      },
    };
    const store = new InMemoryRuntimeStore();
    const manager = new RuntimeRunManager({
      config,
      sha256,
      store,
      gateway,
      registry: new ToolRegistry([]),
    });

    const initial = await manager.start({
      key: "chat:plan",
      input: "prepare a report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (initial.kind !== "started") throw new Error("expected initial run");
    await waitFor(store, initial.run.id, "awaiting_plan_confirmation");

    const resumed = await manager.resumePlan({
      owner: "alice",
      runId: initial.run.id,
      decision: "approved",
    });
    expect(resumed.kind).toBe("started");
    if (resumed.kind !== "started") return;
    await waitFor(store, resumed.run.id, "completed");
    expect(store.getRun(resumed.run.id)?.responseText).toBe("Report prepared.");
  });
});

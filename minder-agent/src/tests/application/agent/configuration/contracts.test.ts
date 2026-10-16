import { describe, expect, it } from "vitest";
import {
  PROMPT_ASSET_IDS,
  createReactLoop,
  createUnavailableAgentLoop,
} from "@application/agent";

describe("agent contracts", () => {
  it("exposes an executable ReAct loop", () => {
    const loop = createReactLoop();
    expect(typeof loop.run).toBe("function");
  });

  it("exposes lifecycle events and the terminal outcome independently", () => {
    const execution = createReactLoop().run(
      {
        run: {
          id: "run-contract" as never,
          status: "running",
          mode: "autonomous",
          trigger: { source: "test" },
          input: "hello",
          depth: 0,
          createdAt: new Date().toISOString(),
        },
        policy: {
          maxIterations: 1,
          doomLoop: { maxRepeatedToolCalls: 1 },
          toolSelection: { allowParallelReadOnly: false },
          reminders: { enabled: false },
          compaction: { enabled: false, tokenThreshold: 1 },
        },
        services: {
          model: {
            async *stream() {
              yield { text: "done" };
            },
          },
          tools: [],
        },
      },
      new AbortController().signal,
    ) as unknown as {
      readonly events?: unknown;
      readonly outcome?: unknown;
    };

    expect(execution.events).toBeDefined();
    expect(execution.outcome).toBeInstanceOf(Promise);
  });

  it("retains the explicitly unavailable loop variant", async () => {
    const loop = createUnavailableAgentLoop();
    await expect(
      loop.run({} as never, new AbortController().signal).outcome,
    ).rejects.toThrow("full-react-loop");
  });

  it("locks prompt assets to the historical template inventory", () => {
    expect(PROMPT_ASSET_IDS).toContain("system/main/main-security-policy");
    expect(PROMPT_ASSET_IDS).toContain("tools/tool-apply-patch");
  });
});

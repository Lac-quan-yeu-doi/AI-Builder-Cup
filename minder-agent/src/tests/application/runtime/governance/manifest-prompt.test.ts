import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { InMemoryRuntimeStore, RuntimeRunManager } from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test",
  model: "test",
};

async function waitForCompleted(store: InMemoryRuntimeStore, runId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = store.getRun(runId)?.status;
    if (status === "completed" || status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not complete`);
}

describe("RuntimeRunManager manifest prompts", () => {
  it("fails clearly instead of running the base agent when the manifest is missing", async () => {
    const debugEntries: string[] = [];
    const store = new InMemoryRuntimeStore();
    const manager = new RuntimeRunManager({
      config,
      sha256,
      store,
      gateway: {
        async *stream() {
          yield { type: "text", text: "base agent must not run" };
        },
      },
      debugLog: (entry) => debugEntries.push(entry),
      manifestLookup: { get: async () => undefined },
    });

    const admission = await manager.start({
      key: "chat:missing-manifest",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "skill-creator",
    });
    if (admission.kind !== "started") throw new Error("expected admission");
    await waitForCompleted(store, admission.run.id);

    expect(store.getRun(admission.run.id)).toMatchObject({
      status: "failed",
      responseText:
        'Agent manifest "skill-creator" was not found for this owner.',
    });
    expect(debugEntries.map((entry) => JSON.parse(entry))).toContainEqual(
      expect.objectContaining({
        event: "agent_manifest_missing",
        runId: admission.run.id,
        manifestName: "skill-creator",
        level: "warn",
      }),
    );
  });

  it("sends the owner manifest prompt to the model", async () => {
    const requests: ChatCompletionRequest[] = [];
    const gateway: ChatCompletionGateway = {
      async *stream(
        request: ChatCompletionRequest,
      ): AsyncIterable<ModelStreamEvent> {
        requests.push(request);
        yield { type: "text", text: "done" };
      },
    };
    const store = new InMemoryRuntimeStore();
    const manager = new RuntimeRunManager({
      config,
      sha256,
      store,
      gateway,
      manifestLookup: {
        get() {
          return {
            owner: "alice",
            systemPrompt: "You are the tenant's report-writing assistant.",
          };
        },
      },
    });

    const admission = await manager.start({
      key: "chat:manifest-prompt",
      input: "Who are you?",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "chat-assistant",
    });
    if (admission.kind !== "started") throw new Error("expected admission");
    await waitForCompleted(store, admission.run.id);

    const systemMessage = requests[0]?.messages[0];
    expect(systemMessage?.role).toBe("system");
    expect(systemMessage?.content).toContain(
      "You are the tenant's report-writing assistant.",
    );
    expect(systemMessage?.content).toContain("ListSkills");
  });
});

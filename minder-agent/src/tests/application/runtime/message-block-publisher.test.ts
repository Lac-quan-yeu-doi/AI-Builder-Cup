import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import type { ModelStreamEvent } from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { ToolRegistry } from "@infrastructure/tools/core";
import { InMemoryRuntimeStore, RuntimeRunManager } from "@application/runtime";
import { createHttpMessageBlockPublisher } from "@application/runtime/execution/message-block-publisher.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

describe("HTTP message block publisher", () => {
  it("publishes the chart block to the room-scoped Core endpoint", async () => {
    const requests: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const publisher = createHttpMessageBlockPublisher({
      coreUrl: "http://celesnity-api:3001",
      sharedSecret: "local-secret",
      fetch: async (url, init) => {
        requests.push({
          url:
            typeof url === "string"
              ? url
              : url instanceof URL
                ? url.toString()
                : url.url,
          init,
        });
        return new Response(null, { status: 201 });
      },
    });

    await publisher.publish({
      roomId: "room-1",
      runId: "run-1",
      block: {
        type: "chart",
        version: 1,
        payload: { title: "Revenue" },
        fallback_text: "Revenue chart preview",
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "http://celesnity-api:3001/api/v1/rooms/room-1/message-blocks",
    );
    expect(requests[0]?.init?.headers).toEqual({
      "content-type": "application/json",
      "x-mcp-shared-secret": "local-secret",
    });
    const body = requests[0]?.init?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toEqual({
      block_type: "chart",
      version: 1,
      payload: { title: "Revenue" },
      fallback_text: "Revenue chart preview",
      run_id: "run-1",
    });
  });

  it("publishes successful MCP metadata from a delegated room run", async () => {
    const published: Array<{
      roomId: string;
      runId: string;
      block: Record<string, unknown>;
    }> = [];
    let modelCalls = 0;
    const runtime = new RuntimeRunManager({
      config,
      sha256,
      store: new InMemoryRuntimeStore(),
      gateway: {
        async *stream() {
          modelCalls += 1;
          if (modelCalls === 1) {
            yield {
              type: "tool_call",
              call: { id: "chart-1", name: "create_chart", arguments: "{}" },
            } satisfies ModelStreamEvent;
            return;
          }
          yield {
            type: "text",
            text: "chart ready",
          } satisfies ModelStreamEvent;
        },
      },
      registry: new ToolRegistry([
        {
          name: "create_chart",
          description: "Create a chart",
          parameters: { type: "object" },
          readOnly: true,
          async execute() {
            return {
              success: true,
              output: "chart ready",
              metadata: {
                message_block: {
                  type: "chart",
                  version: 1,
                  payload: { title: "Revenue" },
                  fallback_text: "Revenue chart preview",
                },
              },
            };
          },
        },
      ]),
      messageBlockPublisher: {
        async publish(input) {
          published.push(input);
        },
      },
    });

    const admission = await runtime.start({
      key: "chat-1",
      input: "draw a chart",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      delegation: { roomId: "room-1", callerSubject: "user-1" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = (await runtime.store.getRun(admission.run.id))?.status;
      if (status === "completed" || status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(published).toEqual([
      {
        roomId: "room-1",
        runId: admission.run.id,
        block: {
          type: "chart",
          version: 1,
          payload: { title: "Revenue" },
          fallback_text: "Revenue chart preview",
        },
      },
    ]);
  });
});

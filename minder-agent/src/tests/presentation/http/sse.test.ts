import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { InMemoryRunManager } from "@application/runtime";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";
import { resolveResumeCursor } from "../../../presentation/http/sse/sse.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function gateway(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

async function startRun(
  server: Awaited<ReturnType<typeof startTestServer>>,
): Promise<string> {
  const response = await request(server, "/api/v1/turns", {
    method: "POST",
    headers: { "x-caller-id": "alice" },
    body: { session_key: "chat:sse", input: "hello" },
  });
  return (JSON.parse(response.body) as { run_id: string }).run_id;
}

describe("Phase 3 SSE", () => {
  it("resolves explicit query cursors before Last-Event-ID", () => {
    expect(resolveResumeCursor("7", "2")).toBe(7);
    expect(resolveResumeCursor(null, "2")).toBe(2);
    expect(resolveResumeCursor("-1", "2")).toBe(0);
  });

  it("streams terminal events and reconnects without duplicates", async () => {
    const manager = new InMemoryRunManager({
      sha256,
      config,
      gateway: gateway([{ type: "text", text: "hello" }]),
    });
    const server = await startTestServer(manager);
    try {
      const runId = await startRun(server);
      const stream = await request(
        server,
        `/api/v1/runs/${runId}/events?from=0`,
        {
          headers: { "x-caller-id": "alice", accept: "text/event-stream" },
        },
      );
      expect(stream.status).toBe(200);
      expect(stream.headers["content-type"]).toBe("text/event-stream");
      expect(stream.body).toContain("event: text");
      expect(stream.body).toContain('data: {"type":"text","data":"hello"}');
      expect(stream.body).toContain(
        'event: done\nid: 2\ndata: {"type":"done","data":{"response_text":"hello"}}',
      );
      const reconnect = await request(server, `/api/v1/runs/${runId}/events`, {
        headers: { "x-caller-id": "alice", "last-event-id": "1" },
      });
      expect(reconnect.body).toContain("event: done\nid: 2");
      expect(reconnect.body).not.toContain("id: 1\nevent: text");
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/events`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});

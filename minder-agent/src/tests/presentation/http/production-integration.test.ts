import type { ChatCompletionGateway } from "@infrastructure/ai";
import { createProductionComposition } from "../../support/production-composition.js";
import { request, startTestServer } from "./harness.js";
import { describe, expect, it } from "vitest";

const environment = {
  LLM_BASE_URL: "https://llm.test",
  LLM_API_KEY: "test-key",
  LLM_MODEL: "test-model",
  MINIO_ENDPOINT: "http://minio.test",
  MINIO_ACCESS_KEY: "access",
  MINIO_SECRET_KEY: "secret",
  MINIO_WORKSPACE_BUCKET: "workspace",
};

const gateway: ChatCompletionGateway = {
  async *stream() {
    yield { type: "text", text: "production composition works" };
  },
};

describe("production composition integration", () => {
  it("serves a run through the composed dependency graph", async () => {
    const composition = await createProductionComposition({
      environment,
      // This composition fixture exercises the dependency graph with the
      // legacy local caller adapter; production composition defaults to Core
      // assertion authentication when this override is omitted.
      authOptions: {},
      factories: {
        createGateway: async () => gateway,
        createWorkspaceProvider: async () => ({
          resolve: async () => ({ root: "/tmp/workspace", prefix: "" }),
          resolvePath: async (root, requested) => `${root}/${requested}`,
          sync: async () => undefined,
          tree: async () => ({ entries: [] }),
          read: async () => undefined,
          readSession: async () => undefined,
        }),
      },
    });
    const server = await startTestServer(composition.dependencies);
    try {
      const response = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:production", input: "hello" },
      });
      expect(response.status).toBe(202);
      const admission = JSON.parse(response.body) as {
        run_id: string;
        session_id: string;
        events_url: string;
      };
      expect(admission).toMatchObject({
        run_id: expect.any(String),
        session_id: expect.any(String),
        events_url: `/api/v1/runs/${admission.run_id}/events`,
      });

      const events = await request(server, admission.events_url, {
        headers: { "x-caller-id": "alice" },
      });
      expect(events.status).toBe(200);
      expect(events.headers["content-type"]).toContain("text/event-stream");
      expect(events.body).toContain('"type":"done"');
      expect(events.body).toContain("production composition works");

      const status = await request(
        server,
        `/api/v1/runs/${admission.run_id}/status`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(status.status).toBe(200);
      expect(JSON.parse(status.body)).toMatchObject({
        run_id: admission.run_id,
        status: "completed",
        response_text: "production composition works",
      });

      const foreignStatus = await request(
        server,
        `/api/v1/runs/${admission.run_id}/status`,
        { headers: { "x-caller-id": "bob" } },
      );
      expect(foreignStatus.status).toBe(404);
      expect(JSON.parse(foreignStatus.body)).toMatchObject({
        error: "run_not_found",
      });
    } finally {
      await server.close();
      await composition.shutdown();
    }
  });
});

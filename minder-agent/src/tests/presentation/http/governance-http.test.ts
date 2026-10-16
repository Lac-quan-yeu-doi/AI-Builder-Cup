import { sha256 } from "@infrastructure/crypto/sha256.js";
import type { ChatCompletionGateway } from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { InMemoryRunManager } from "@application/runtime";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

const gateway: ChatCompletionGateway = {
  async *stream() {
    yield { type: "text", text: "done" };
  },
};

describe("governance HTTP routes", () => {
  it("returns the run admission using the public snake_case contract", async () => {
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      gateway,
    });
    const admission = await runtime.start({
      key: "chat:governance",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    const server = await startTestServer({ runtime });
    try {
      const response = await request(
        server,
        `/api/v1/runs/${admission.run.id}/governance`,
        {
          headers: { "x-caller-id": "alice" },
        },
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        run_id: admission.run.id,
        policy_revision: expect.any(String),
        admitted_at: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });

  it("lists redacted governance evidence with a cursor and tenant isolation", async () => {
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      gateway,
    });
    const admission = await runtime.start({
      key: "chat:evidence-http",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    runtime.store.appendGovernanceEvidence("alice", {
      runId: admission.run.id,
      at: "2026-09-16T00:00:01.000Z",
      kind: "redaction",
      detail: {
        fields: ["arguments", "preview"],
        reason: "sensitive values omitted",
      },
    });
    const server = await startTestServer({ runtime });
    try {
      const response = await request(
        server,
        `/api/v1/runs/${admission.run.id}/governance/evidence?limit=1`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        items: [
          expect.objectContaining({
            run_id: admission.run.id,
            kind: "admission",
            seq: 1,
          }),
        ],
        next_cursor: expect.any(String),
      });
      expect(
        (
          await request(
            server,
            `/api/v1/runs/${admission.run.id}/governance/evidence`,
            {
              headers: { "x-caller-id": "bob" },
            },
          )
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});

import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import { InMemoryRunManager } from "@application/runtime";
import { createManifestLoader } from "@infrastructure/agent";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

const config = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};
const headers = { "x-caller-id": "alice", "x-request-id": "v2-contract-1" };
const governanceYaml = `
name: governed-agent
description: Governed test agent.
system_prompt: Stay concise.
tools:
  mode: all
  names: []
execution:
  mode: interactive
governance:
  autonomy: supervised
  auto_approvals:
    - Write
`;

function runtime(
  events: readonly ModelStreamEvent[] = [{ type: "text", text: "done" }],
  debugLog?: (entry: string) => void,
) {
  return new InMemoryRunManager({
    sha256,
    config,
    ...(debugLog === undefined ? {} : { debugLog }),
    gateway: {
      async *stream() {
        yield* events;
      },
    } satisfies ChatCompletionGateway,
  });
}

function expectResponseRequestId(
  response: Awaited<ReturnType<typeof request>>,
): void {
  expect(JSON.parse(response.body).request_id).toBe(
    response.headers["x-request-id"],
  );
}

describe("v2 HTTP contract", () => {
  it("admits a run and exposes the path session, status, and replay stream", async () => {
    const server = await startTestServer(runtime());
    try {
      const admitted = await request(server, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:one", input: "hello" },
      });
      expect(admitted.status).toBe(202);
      expectResponseRequestId(admitted);
      const body = JSON.parse(admitted.body) as {
        run_id: string;
        events_url: string;
      };
      expect(body.events_url).toBe(`/api/v2/runs/${body.run_id}/events`);
      expect(admitted.headers["content-location"]).toBe(
        `/api/v2/runs/${body.run_id}`,
      );
      const v1 = await request(server, "/api/v1/turns", {
        method: "POST",
        headers,
        body: { session_key: "chat:v1", input: "hello" },
      });
      expect(v1.status).toBe(202);
      expect(v1.headers["x-request-id"]).toBe("v2-contract-1");
      expect(JSON.parse(v1.body)).not.toHaveProperty("request_id");
      expect(
        (await request(server, "/api/v2/sessions/chat%3Aone", { headers }))
          .status,
      ).toBe(200);
      expect(
        (
          await request(server, `/api/v2/runs/${body.run_id}/status`, {
            headers,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(server, `/api/v2/runs/${body.run_id}/status`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      const stream = await request(server, `${body.events_url}?cursor=0`, {
        headers,
      });
      expect(stream.status).toBe(200);
      expect(stream.body).toContain(
        'event: stream_opened\nid: 0\ndata: {"request_id":"v2-contract-1","run_id":"',
      );
      expect(stream.body).toContain('"cursor":"0"}');
      expect(stream.body).toContain("event: text\nid: 1");
      expect(stream.body).toContain("event: done\nid: 2");
      expect(stream.body.indexOf("event: text\nid: 1")).toBeLessThan(
        stream.body.indexOf("event: done\nid: 2"),
      );
      const replay = await request(server, `${body.events_url}?cursor=1`, {
        headers,
      });
      expect(replay.body).not.toContain("event: text\nid: 1");
      expect(replay.body).toContain("event: done\nid: 2");
    } finally {
      await server.close();
    }
  });

  it("returns terminal completion before wait_ms and a conflict with request_id", async () => {
    const server = await startTestServer(runtime());
    try {
      const completed = await request(server, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:block", input: "hello", wait_ms: 1_000 },
      });
      expect(completed.status).toBe(200);
      expectResponseRequestId(completed);
      expect(JSON.parse(completed.body)).toMatchObject({
        status: "completed",
        response_text: "done",
      });
    } finally {
      await server.close();
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const busy = await startTestServer(
      new InMemoryRunManager({
        sha256,
        config,
        gateway: {
          async *stream() {
            await gate;
            yield { type: "text", text: "done" } as const;
          },
        },
      }),
    );
    try {
      const first = await request(busy, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:busy", input: "hello" },
      });
      expect(first.status).toBe(202);
      expectResponseRequestId(first);
      const conflict = await request(busy, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:busy", input: "again" },
      });
      expect(conflict.status).toBe(409);
      expect(JSON.parse(conflict.body)).toMatchObject({
        error: "session_busy",
        request_id: "v2-contract-1",
      });
    } finally {
      release();
      await busy.close();
    }
  });

  it("keeps run admission HOME-only while Analytics can read status and events", async () => {
    const server = await startTestServer({
      runtime: runtime(),
      authOptions: {
        authenticator: {
          async authenticate(requestHeaders: Record<string, string>) {
            const identityId =
              requestHeaders.authorization === "Bearer other"
                ? "other"
                : "creator";
            return {
              subject: identityId,
              scope: {
                identityTenantId: "tenant-a",
                organizationId: "org-a",
                identityId,
              },
              role: "ORG_OWNER",
              permissions: ["workspace:read"],
              visibleFeatures:
                requestHeaders.authorization === "Bearer creator"
                  ? ["HOME"]
                  : ["ANALYTICS"],
            } as never;
          },
        },
      },
    });
    try {
      const denied = await request(server, "/api/v2/runs", {
        method: "POST",
        headers: { authorization: "Bearer assertion" },
        body: { session_key: "chat:analytics-denied", input: "hello" },
      });
      expect(denied.status).toBe(403);

      const result = await request(server, "/api/v2/runs", {
        method: "POST",
        headers: { authorization: "Bearer creator" },
        body: { session_key: "chat:analytics", input: "hello" },
      });
      expect(result.status).toBe(202);
      expectResponseRequestId(result);
      const body = JSON.parse(result.body) as {
        run_id: string;
        events_url: string;
      };
      const reader = { authorization: "Bearer assertion" };
      const foreign = { authorization: "Bearer other" };
      const status = await request(
        server,
        `/api/v2/runs/${body.run_id}/status`,
        { headers: reader },
      );
      expect(status.status).toBe(200);
      expect(JSON.parse(status.body).run_id).toBe(body.run_id);
      const events = await request(server, body.events_url, {
        headers: reader,
      });
      expect(events.status).toBe(200);
      expect(events.body).toContain("event: done\nid: 2");
      expect(
        (
          await request(server, `/api/v2/runs/${body.run_id}/status`, {
            headers: foreign,
          })
        ).status,
      ).toBe(404);
      expect(
        (await request(server, body.events_url, { headers: foreign })).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("uses the path session key for tool results and rejects a mismatched body key", async () => {
    const server = await startTestServer(runtime());
    try {
      const mismatch = await request(
        server,
        "/api/v2/sessions/chat%3Aone/tool-results",
        {
          method: "POST",
          headers,
          body: {
            session_key: "chat:other",
            tool_call_id: "preview",
            content: "ok",
          },
        },
      );
      expect(mismatch.status).toBe(400);
      expect(JSON.parse(mismatch.body)).toMatchObject({
        error: "session_key_mismatch",
        request_id: "v2-contract-1",
      });
      const missing = await request(
        server,
        "/api/v2/sessions/chat%3Aone/tool-results",
        {
          method: "POST",
          headers,
          body: { tool_call_id: "preview", content: "ok" },
        },
      );
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("admits a client tool result using the path key and keeps sessions owner scoped", async () => {
    let calls = 0;
    const server = await startTestServer(
      new InMemoryRunManager({
        sha256,
        config,
        clientTools: [
          {
            name: "RenderPreview",
            description: "Render markdown",
            parameters: { type: "object" },
          },
        ],
        gateway: {
          async *stream() {
            calls += 1;
            if (calls === 1) {
              yield {
                type: "tool_call",
                call: { id: "preview", name: "RenderPreview", arguments: "{}" },
              } as const;
              return;
            }
            yield { type: "text", text: "continued" } as const;
          },
        },
      }),
    );
    try {
      const started = await request(server, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:tool", input: "preview" },
      });
      const runId = JSON.parse(started.body).run_id as string;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await request(server, `/api/v2/runs/${runId}/status`, {
          headers,
        });
        if (JSON.parse(status.body).status === "awaiting_client_tool") break;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      expect(
        (
          await request(server, "/api/v2/sessions/chat%3Atool", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      const resumed = await request(
        server,
        "/api/v2/sessions/chat%3Atool/tool-results",
        {
          method: "POST",
          headers,
          body: { tool_call_id: "preview", content: "rendered" },
        },
      );
      expect(resumed.status).toBe(202);
      expectResponseRequestId(resumed);
      const result = JSON.parse(resumed.body) as {
        run_id: string;
        events_url: string;
      };
      expect(result.events_url).toBe(`/api/v2/runs/${result.run_id}/events`);
    } finally {
      await server.close();
    }
  });

  it("exposes canonical webhook and governance validation paths", async () => {
    const server = await startTestServer({
      runtime: runtime(),
      manifestLoader: createManifestLoader({
        workspace: {
          async list() {
            return [];
          },
          async read() {
            return undefined;
          },
          async write() {
            throw new Error("not used");
          },
          async remove() {
            throw new Error("not used");
          },
        },
      }),
      authOptions: {
        authenticator: {
          async authenticate() {
            return {
              subject: "core",
              scope: {
                identityTenantId: "tenant-a",
                organizationId: "org-a",
                identityId: "identity-a",
              },
              role: "SERVICE_ACCOUNT",
              permissions: ["workspace:read", "workspace:write"],
              visibleFeatures: ["AUTOMATIONS", "HOME"],
            } as never;
          },
        },
      },
    });
    try {
      const webhook = await request(
        server,
        "/api/v2/webhooks/automation-workflow/runs",
        {
          method: "POST",
          headers: {
            authorization: "Bearer assertion",
            "x-request-id": "v2-contract-1",
            "x-delivery-id": "v2-delivery-1",
          },
          body: {
            session_key: "workflow:one",
            input: "run",
            run_id: "40000000-0000-4000-8000-000000000001",
          },
        },
      );
      expect(webhook.status, webhook.body).toBe(202);
      expectResponseRequestId(webhook);
      expect(JSON.parse(webhook.body).events_url).toBe(
        "/api/v2/runs/40000000-0000-4000-8000-000000000001/events",
      );
      const duplicate = await request(
        server,
        "/api/v2/webhooks/automation-workflow/runs",
        {
          method: "POST",
          headers: {
            authorization: "Bearer assertion",
            "x-delivery-id": "v2-delivery-1",
            "x-request-id": "v2-contract-2",
          },
          body: {
            session_key: "workflow:one",
            input: "run",
            run_id: "40000000-0000-4000-8000-000000000001",
          },
        },
      );
      expect(duplicate.status).toBe(200);
      expect(JSON.parse(duplicate.body).status).toBe("duplicate_delivery");
      expectResponseRequestId(duplicate);
      const governance = await request(
        server,
        "/api/v2/agent-manifests/governance/validate",
        {
          method: "POST",
          headers: { authorization: "Bearer assertion" },
          body: { yaml: governanceYaml },
        },
      );
      expect(governance.status).toBe(200);
      expect(JSON.parse(governance.body)).toMatchObject({
        valid: true,
        policy_revision: expect.any(String),
        policy: { autonomy: "supervised", autoApprovals: ["Write"] },
      });
    } finally {
      await server.close();
    }
  });

  it("rejects v1-only cursor aliases on v2 readers and room streams", async () => {
    const server = await startTestServer(runtime());
    try {
      const admitted = await request(server, "/api/v2/runs", {
        method: "POST",
        headers,
        body: { session_key: "chat:cursor", input: "hello" },
      });
      const runId = JSON.parse(admitted.body).run_id as string;
      expect(
        (
          await request(server, `/api/v2/runs/${runId}/trace?after_seq=1`, {
            headers,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(server, `/api/v2/runs/${runId}/trace?from=1`, {
            headers,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(server, `/api/v2/runs/${runId}/files?after_seq=1`, {
            headers,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            server,
            `/api/v2/runs/${runId}/governance/evidence?after_seq=1`,
            { headers },
          )
        ).status,
      ).toBe(400);
      const invalidCursor = await request(
        server,
        `/api/v2/runs/${runId}/events?from=1`,
        { headers },
      );
      expect(invalidCursor.status).toBe(400);
      expect(JSON.parse(invalidCursor.body)).toMatchObject({
        error: "invalid_cursor",
        request_id: "v2-contract-1",
      });
      expect(
        (
          await request(server, "/api/v2/rooms/missing/events?from=1", {
            headers,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(server, "/api/v2/rooms/missing/events?include=deltas", {
            headers,
          })
        ).status,
      ).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("uses v2 event links for room runs and resumes room events by cursor", async () => {
    const server = await startTestServer(runtime());
    try {
      const created = await request(server, "/api/v2/rooms", {
        method: "POST",
        headers,
        body: { name: "V2 room", max_concurrent_runs: 1, members: ["writer"] },
      });
      expect(created.status).toBe(201);
      const roomId = JSON.parse(created.body).id as string;
      const admitted = await request(server, `/api/v2/rooms/${roomId}/runs`, {
        method: "POST",
        headers,
        body: { agent: "writer", input: "hello" },
      });
      expect(admitted.status).toBe(202);
      expectResponseRequestId(admitted);
      const body = JSON.parse(admitted.body) as {
        run_id: string;
        events_url: string;
        room_events_url: string;
      };
      expect(body.events_url).toBe(`/api/v2/runs/${body.run_id}/events`);
      expect(body.room_events_url).toBe(`/api/v2/rooms/${roomId}/events`);
      expect(admitted.headers["content-location"]).toBe(
        `/api/v2/runs/${body.run_id}`,
      );
      const stream = await request(
        server,
        `${body.room_events_url}?cursor=${encodeURIComponent(`${body.run_id}:1`)}`,
        { headers },
      );
      expect(stream.status).toBe(200);
      expect(stream.body).toContain(`id: ${body.run_id}:2`);
      expect(stream.body).not.toContain(`id: ${body.run_id}:1`);
    } finally {
      await server.close();
    }
  });

  it("correlates signed v2 room webhook admissions", async () => {
    const debugEntries: string[] = [];
    const server = await startTestServer({
      runtime: runtime(undefined, (entry) => debugEntries.push(entry)),
      webhookSecretResolver: async () => "hook-secret",
    });
    try {
      const room = await request(server, "/api/v2/rooms", {
        method: "POST",
        headers,
        body: {
          name: "Webhook room",
          max_concurrent_runs: 1,
          members: ["writer"],
        },
      });
      const roomId = JSON.parse(room.body).id as string;
      const configured = await request(
        server,
        `/api/v2/rooms/${roomId}/webhooks`,
        {
          method: "POST",
          headers,
          body: { agent: "writer", source: "github", secret_ref: "room-hook" },
        },
      );
      const webhookId = JSON.parse(configured.body).id as string;
      const body = JSON.stringify({ input: "review this change" });
      const signature = `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}`;
      const endpoint = `/api/v2/room-webhooks/${webhookId}`;
      const first = await request(server, endpoint, {
        method: "POST",
        body,
        headers: {
          "x-minder-signature": signature,
          "x-delivery-id": "room-delivery-1",
          "x-request-id": "room-request-1",
        },
      });
      expect(first.status).toBe(202);
      expect(JSON.parse(first.body)).toMatchObject({
        room_id: roomId,
        run_id: expect.any(String),
      });
      expectResponseRequestId(first);
      await expect
        .poll(() =>
          debugEntries.some(
            (entry) =>
              entry.includes('"event":"agent_run_started"') &&
              entry.includes('"requestId":"room-request-1"'),
          ),
        )
        .toBe(true);
      const second = await request(server, endpoint, {
        method: "POST",
        body,
        headers: {
          "x-minder-signature": signature,
          "x-delivery-id": "room-delivery-1",
          "x-request-id": "room-request-2",
        },
      });
      expect(second.status).toBe(202);
      expectResponseRequestId(second);
    } finally {
      await server.close();
    }
  });
});

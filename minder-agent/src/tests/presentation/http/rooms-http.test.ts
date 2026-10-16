import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import { createManifestLoader } from "@infrastructure/agent";
import { organizationScopeKey } from "@domain/index.js";
import type { LlmConfig } from "@infrastructure/configuration";
import { InMemoryRunManager } from "@application/runtime";
import {
  createMemoryS3WorkspaceStorage,
  createS3WorkspaceProvider,
} from "@infrastructure/workspace";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test-key",
  model: "test-model",
};

function gateway(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

const roomManifestYaml = `
name: writer
description: Writes reports.
system_prompt: You write concise reports.
tools:
  mode: allowlist
  names: [Read]
execution:
  mode: interactive
  max_iterations: 8
`;

describe("native room HTTP compatibility", () => {
  it("keeps structured room context out of the user input", async () => {
    const requests: Parameters<ChatCompletionGateway["stream"]>[0][] = [];
    const server = await startTestServer({
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: {
          async *stream(modelRequest) {
            requests.push(modelRequest);
            yield { type: "text", text: "finished" };
          },
        },
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Workflow room",
          max_concurrent_runs: 1,
          members: ["writer"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;
      const requestedRunId = "40000000-0000-4000-8000-000000000001";
      const started = await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          agent: "writer",
          input: "add a step",
          run_id: requestedRunId,
          context: {
            kind: "automation-workflow",
            workflow_id: "wf-1",
            workflow_name: "Ingest to Slack",
          },
        },
      });

      expect(started.status).toBe(202);
      expect((JSON.parse(started.body) as { run_id: string }).run_id).toBe(
        requestedRunId,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const messages = requests[0]?.messages ?? [];
      expect(messages.at(-1)).toEqual({ role: "user", content: "add a step" });
      expect(messages[0]?.content).toContain('"workflowId":"wf-1"');
      expect(messages[0]?.content).toContain(
        '"workflowName":"Ingest to Slack"',
      );
    } finally {
      await server.close();
    }
  });

  it("looks up room manifests by organization while admitting a user-owned run", async () => {
    const manifestOwner = organizationScopeKey({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
    });
    let seenOwner = "";
    const manifestLoader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read(owner: string) {
          seenOwner = owner;
          return roomManifestYaml;
        },
        async write() {},
        async remove() {},
      },
    });
    const authenticator = {
      async authenticate() {
        return {
          subject: "alice",
          scope: {
            identityTenantId: "tenant-a",
            organizationId: "org-a",
            identityId: "identity-a",
          },
          role: "ORG_OWNER",
          permissions: ["workspace:read", "workspace:write"],
          visibleFeatures: null,
        } as never;
      },
    };
    const server = await startTestServer({
      manifestLoader,
      authOptions: { authenticator },
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway([{ type: "text", text: "finished" }]),
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { authorization: "Bearer assertion" },
        body: {
          name: "Shared room",
          max_concurrent_runs: 1,
          members: ["writer"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;
      const started = await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { authorization: "Bearer assertion" },
        body: { agent: "writer", input: "hello" },
      });
      expect(started.status).toBe(202);
      expect(seenOwner).toBe(manifestOwner);
    } finally {
      await server.close();
    }
  });

  it("rejects a room run when its selected agent manifest is missing", async () => {
    const manifestLoader = createManifestLoader({
      workspace: {
        async list() {
          return [];
        },
        async read() {
          return undefined;
        },
        async write() {},
        async remove() {},
      },
    });
    const server = await startTestServer({
      manifestLoader,
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway([{ type: "text", text: "must not run" }]),
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Missing manifest room",
          max_concurrent_runs: 1,
          members: ["skill-creator"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;

      const started = await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          agent: "skill-creator",
          input: "hello",
          kind: "session_bound",
        },
      });

      expect(started.status).toBe(404);
      expect(JSON.parse(started.body)).toEqual({
        error: "agent_manifest_not_found",
      });
    } finally {
      await server.close();
    }
  });

  it("does not trust x-caller-id for rooms when Core assertions are configured", async () => {
    const server = await startTestServer(undefined, undefined, {
      authenticator: {
        async authenticate() {
          throw new Error("not used for bearer-less requests");
        },
      },
    });
    try {
      const response = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "platform-admin" },
        body: {
          name: "Spoofed room",
          max_concurrent_runs: 1,
          members: ["chat-assistant"],
        },
      });
      expect(response.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("lists and reads only the caller's durable room workspace", async () => {
    const cacheDirectory = await mkdtemp(
      join(tmpdir(), "minder-workspace-http-"),
    );
    const workspaceProvider = createS3WorkspaceProvider({
      storage: createMemoryS3WorkspaceStorage(),
      cacheDirectory,
    });
    const roomId = "room-workspace";
    const workspace = await workspaceProvider.resolve(
      "alice",
      `room:${roomId}:agent:chat-assistant`,
    );
    await writeFile(join(workspace.root, "report.md"), "# Who I Am\n", "utf8");
    await workspaceProvider.sync(workspace);
    const server = await startTestServer(
      undefined,
      undefined,
      {},
      workspaceProvider,
    );
    try {
      const tree = await request(
        server,
        `/api/v1/rooms/${roomId}/workspace/tree`,
        {
          headers: { "x-caller-id": "alice" },
        },
      );
      expect(tree.status).toBe(200);
      expect(JSON.parse(tree.body)).toMatchObject({
        entries: [{ path: "report.md", is_dir: false, size_bytes: 11 }],
        truncated: false,
      });

      const content = await request(
        server,
        `/api/v1/rooms/${roomId}/workspace/content?path=report.md`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(content.status).toBe(200);
      expect(content.body).toBe("# Who I Am\n");

      const foreign = await request(
        server,
        `/api/v1/rooms/${roomId}/workspace/tree`,
        {
          headers: { "x-caller-id": "bob" },
        },
      );
      expect(foreign.status).toBe(200);
      expect(JSON.parse(foreign.body)).toEqual({
        entries: [],
        truncated: false,
      });
    } finally {
      await server.close();
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });

  it("creates and lists a caller-owned chat room without exposing it to another caller", async () => {
    const server = await startTestServer(
      new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway([]),
      }),
    );
    try {
      const created = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "New chat",
          max_concurrent_runs: 1,
          key: "chat-1",
          members: ["chat-assistant"],
        },
      });

      expect(created.status).toBe(201);
      expect(JSON.parse(created.body)).toMatchObject({
        name: "New chat",
        key: "chat-1",
        status: "open",
      });

      const ownerRooms = await request(server, "/api/v1/rooms", {
        headers: { "x-caller-id": "alice" },
      });
      expect(JSON.parse(ownerRooms.body)).toHaveLength(1);

      const otherRooms = await request(server, "/api/v1/rooms", {
        headers: { "x-caller-id": "bob" },
      });
      expect(JSON.parse(otherRooms.body)).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("adds and removes members only within the room owner's roster", async () => {
    const server = await startTestServer();
    try {
      const created = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Team room",
          max_concurrent_runs: 1,
          members: ["writer"],
        },
      });
      const roomId = (JSON.parse(created.body) as { id: string }).id;

      const added = await request(server, `/api/v1/rooms/${roomId}/members`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { agent: "reviewer" },
      });
      expect(added.status).toBe(200);
      expect(JSON.parse(added.body)).toMatchObject({
        members: ["reviewer", "writer"],
      });

      expect(
        (
          await request(server, `/api/v1/rooms/${roomId}/members/reviewer`, {
            method: "DELETE",
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);

      const removed = await request(
        server,
        `/api/v1/rooms/${roomId}/members/reviewer`,
        { method: "DELETE", headers: { "x-caller-id": "alice" } },
      );
      expect(removed.status).toBe(200);
      expect(JSON.parse(removed.body)).toMatchObject({ members: ["writer"] });
    } finally {
      await server.close();
    }
  });

  it("accepts a signed room webhook only for its configured member", async () => {
    const admittedRequestIds: (string | undefined)[] = [];
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      gateway: gateway([{ type: "text", text: "webhook handled" }]),
    });
    const admitQueued = runtime.admitQueued.bind(runtime);
    runtime.admitQueued = async (input) => {
      admittedRequestIds.push(input.requestId);
      return admitQueued(input);
    };
    const server = await startTestServer({
      runtime,
      webhookSecretResolver: async ({ secretRef }) =>
        secretRef === "room-hook" ? "hook-secret" : undefined,
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Webhook room",
          max_concurrent_runs: 1,
          members: ["writer"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;
      const configured = await request(
        server,
        `/api/v1/rooms/${roomId}/webhooks`,
        {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: { agent: "writer", source: "github", secret_ref: "room-hook" },
        },
      );
      expect(configured.status).toBe(201);
      const webhookId = (JSON.parse(configured.body) as { id: string }).id;
      const body = JSON.stringify({ input: "review this change" });
      const signature = `sha256=${createHmac("sha256", "hook-secret")
        .update(body)
        .digest("hex")}`;

      expect(
        (
          await request(server, `/api/v1/room-webhooks/${webhookId}`, {
            method: "POST",
            headers: {
              "x-delivery-id": "delivery-1",
              "x-request-id": "webhook-request-1",
              "x-minder-signature": signature,
            },
            body,
          })
        ).status,
      ).toBe(202);
      expect(admittedRequestIds).toEqual(["webhook-request-1"]);
      expect(
        (
          await request(server, `/api/v1/room-webhooks/${webhookId}`, {
            method: "POST",
            headers: { "x-minder-signature": "sha256=bad" },
            body,
          })
        ).status,
      ).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("admits a session-bound room run and exposes the resulting transcript only to its owner", async () => {
    const debugEntries: string[] = [];
    const server = await startTestServer({
      debugLog: (entry) => debugEntries.push(entry),
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway([{ type: "text", text: "hello from room" }]),
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "New chat",
          max_concurrent_runs: 1,
          key: "chat-1",
          members: ["chat-assistant"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;

      const started = await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice", "x-request-id": "web-request-1" },
        body: {
          agent: "chat-assistant",
          input: "hello",
          kind: "session_bound",
        },
      });
      expect(started.status).toBe(202);
      expect(debugEntries.join("\n")).toContain(
        'room_run_admitted:{"requestId":"web-request-1"',
      );
      const result = JSON.parse(started.body) as {
        run_id: string;
        session_id: string;
        events_url: string;
        room_events_url: string;
      };
      expect(started.headers["content-location"]).toBe(
        `/api/v1/runs/${result.run_id}`,
      );
      expect(result.events_url).toBe(`/api/v1/runs/${result.run_id}/events`);
      expect(result.room_events_url).toBe(`/api/v1/rooms/${roomId}/events`);

      const events = await request(
        server,
        `${result.room_events_url}?include=deltas`,
        {
          headers: { "x-caller-id": "alice", accept: "text/event-stream" },
        },
      );
      expect(events.status).toBe(200);
      expect(events.body).toContain("event: text");
      expect(events.body).toContain(`"run_id":"${result.run_id}"`);
      expect(events.body).toContain("event: run_finished");

      const resumed = await request(
        server,
        `${result.room_events_url}?include=deltas&after_seq=${result.run_id}:1`,
        { headers: { "x-caller-id": "alice", accept: "text/event-stream" } },
      );
      expect(resumed.status).toBe(200);
      expect(resumed.body).not.toContain("event: text");
      expect(resumed.body).toContain("event: done");

      const metrics = await request(server, `/api/v1/rooms/${roomId}/metrics`, {
        headers: { "x-caller-id": "alice" },
      });
      expect(metrics.status).toBe(200);
      expect(JSON.parse(metrics.body)).toMatchObject({
        total: 1,
        succeeded: 1,
        failed: 0,
        running: 0,
      });

      const transcript = await request(
        server,
        `/api/v1/sessions/${result.session_id}/transcript`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(transcript.status).toBe(200);
      expect(
        (
          JSON.parse(transcript.body) as {
            history: readonly { role: string }[];
          }
        ).history,
      ).toEqual(expect.any(Array));
      expect(
        (
          await request(
            server,
            `/api/v1/sessions/${result.session_id}/transcript`,
            {
              headers: { "x-caller-id": "bob" },
            },
          )
        ).status,
      ).toBe(404);

      const history = await request(server, `/api/v1/rooms/${roomId}/history`, {
        headers: { "x-caller-id": "alice" },
      });
      expect(history.status).toBe(200);
      expect(JSON.parse(history.body)).toMatchObject({
        room_id: roomId,
        runs: [
          {
            run_id: result.run_id,
            session_id: result.session_id,
            input: "hello",
            events: expect.arrayContaining([
              expect.objectContaining({
                payload: expect.objectContaining({ type: "text" }),
              }),
              expect.objectContaining({
                payload: expect.objectContaining({ type: "done" }),
              }),
            ]),
          },
        ],
      });

      const foreignHistory = await request(
        server,
        `/api/v1/rooms/${roomId}/history`,
        { headers: { "x-caller-id": "bob" } },
      );
      expect(foreignHistory.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("keeps a long-running room event stream alive", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await startTestServer({
      roomKeepaliveMs: 5,
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: {
          async *stream() {
            await gate;
            yield { type: "text", text: "finished" };
          },
        },
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Long chat",
          max_concurrent_runs: 1,
          members: ["chat-assistant"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;
      await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { agent: "chat-assistant", input: "wait" },
      });

      const eventsPromise = request(
        server,
        `/api/v1/rooms/${roomId}/events?include=deltas`,
        { headers: { "x-caller-id": "alice", accept: "text/event-stream" } },
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      release?.();
      const events = await eventsPromise;
      expect(events.status).toBe(200);
      expect(events.body).toContain(": keepalive");
      expect(events.body).toContain("event: done");
    } finally {
      await server.close();
    }
  });

  it("does not let an older active run block a newer run's room events", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const server = await startTestServer({
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: {
          async *stream(modelRequest) {
            const prompt = modelRequest.messages.at(-1)?.content;
            if (prompt === "first") await firstRun;
            yield { type: "text", text: prompt ?? "unknown" };
          },
        },
      }),
    });
    try {
      const room = await request(server, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "Concurrent chat",
          max_concurrent_runs: 2,
          members: ["writer", "reviewer"],
        },
      });
      const roomId = (JSON.parse(room.body) as { id: string }).id;
      await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { agent: "writer", input: "first" },
      });
      await request(server, `/api/v1/rooms/${roomId}/runs`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { agent: "reviewer", input: "second" },
      });

      const response = await firstSseFrame(
        server,
        `/api/v1/rooms/${roomId}/events`,
      );
      expect(response).toContain("event: text");
      expect(response).toContain('"data":"second"');
      releaseFirst?.();
    } finally {
      releaseFirst?.();
      await server.close();
    }
  });
});

function firstSseFrame(
  server: Awaited<ReturnType<typeof startTestServer>>,
  path: string,
): Promise<string> {
  return (async () => {
    const response = await fetch(
      `http://127.0.0.1:${server.address.port}${path}`,
      { headers: { "x-caller-id": "alice", accept: "text/event-stream" } },
    );
    if (!response.body) throw new Error("SSE response did not expose a body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body;
      body += decoder.decode(chunk.value, { stream: true });
      if (body.includes("event: text")) {
        await reader.cancel();
        return body;
      }
    }
  })();
}

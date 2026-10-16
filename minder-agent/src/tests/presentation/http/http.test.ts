import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { organizationScopeKey, principalScopeKey } from "@domain/index.js";
import { InMemoryRunManager, InMemoryRuntimeStore } from "@application/runtime";
import type { RunEvidencePort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function scripted(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

async function waitForStatus(
  server: Awaited<ReturnType<typeof startTestServer>>,
  runId: string,
  status: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(server, `/api/v1/runs/${runId}/status`, {
      headers: { "x-caller-id": "alice" },
    });
    if ((JSON.parse(response.body) as { status: string }).status === status)
      return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run did not reach ${status}`);
}

describe("Phase 3 JSON HTTP routes", () => {
  it("admits automation workflow webhooks only from a verified service principal with a run ID", async () => {
    let role: "ORG_OWNER" | "SERVICE_ACCOUNT" = "ORG_OWNER";
    const server = await startTestServer({
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: scripted([{ type: "text", text: "done" }]),
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
              role,
              permissions: ["workspace:read", "workspace:write"],
              visibleFeatures: ["AUTOMATIONS"],
            } as never;
          },
        },
      },
    });
    const input = {
      session_key: "workflow:one",
      input: "run",
      run_id: "40000000-0000-4000-8000-000000000001",
    };
    try {
      const headers = { authorization: "Bearer assertion" };
      expect(
        (
          await request(server, "/api/v1/webhooks/automation-workflow", {
            method: "POST",
            headers,
            body: input,
          })
        ).status,
      ).toBe(403);
      role = "SERVICE_ACCOUNT";
      expect(
        (
          await request(server, "/api/v1/webhooks/automation-workflow", {
            method: "POST",
            headers,
            body: { ...input, run_id: undefined },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(server, "/api/v1/webhooks/github", {
            method: "POST",
            headers,
            body: input,
          })
        ).status,
      ).toBe(400);
      const accepted = await request(
        server,
        "/api/v1/webhooks/automation-workflow",
        {
          method: "POST",
          headers,
          body: input,
        },
      );
      expect(accepted.status).toBe(202);
      expect(JSON.parse(accepted.body)).toMatchObject({ run_id: input.run_id });
    } finally {
      await server.close();
    }
  });

  it("passes the organization manifest owner to direct turns while keeping the run owner user-scoped", async () => {
    const resourceOwner = principalScopeKey({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
      identityId: "identity-a",
    });
    const manifestOwner = organizationScopeKey({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
    });
    let seenOwner = "";
    let seenManifestOwner = "";
    let seenContextOrganizationId: string | undefined;
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      gateway: scripted([{ type: "text", text: "done" }]),
      manifestLookup: {
        get({ owner, manifestOwner: scope }) {
          seenOwner = owner;
          seenManifestOwner = scope ?? "";
          return undefined;
        },
      },
    });
    const originalStart = runtime.start.bind(runtime);
    runtime.start = async (input) => {
      seenContextOrganizationId = input.context?.organizationId;
      return originalStart(input);
    };
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
      runtime,
      authOptions: { authenticator },
    });
    try {
      const response = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { authorization: "Bearer assertion" },
        body: {
          session_key: "chat:shared",
          input: "hello",
          agent: "writer",
          automation_context: {
            kind: "automation-workflow",
            organization_id: "attacker-org",
          },
        },
      });
      expect(response.status).toBe(202);
      expect(seenOwner).toBe(resourceOwner);
      expect(seenManifestOwner).toBe(manifestOwner);
      expect(seenContextOrganizationId).toBe("org-a");
    } finally {
      await server.close();
    }
  });

  it("returns a completed durable result from a blocking turn", async () => {
    const server = await startTestServer(
      new InMemoryRunManager({
        sha256,
        config,
        gateway: scripted([{ type: "text", text: "blocking hello" }]),
      }),
    );
    try {
      const response = await request(server, "/api/v1/turns/blocking", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:blocking", input: "hello", wait_ms: 1_000 },
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        response_text: "blocking hello",
        status: "completed",
      });
    } finally {
      await server.close();
    }
  });

  it("rejects an invalid blocking wait before admitting a run", async () => {
    const server = await startTestServer(
      new InMemoryRunManager({
        sha256,
        config,
        gateway: scripted([]),
      }),
    );
    try {
      await expect(
        request(server, "/api/v1/turns/blocking", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: {
            session_key: "chat:invalid-wait",
            input: "hello",
            wait_ms: -1,
          },
        }),
      ).resolves.toMatchObject({
        status: 400,
        body: JSON.stringify({ error: "invalid_blocking_wait" }),
      });
      await expect(
        request(server, "/api/v1/sessions?key=chat%3Ainvalid-wait", {
          headers: { "x-caller-id": "alice" },
        }),
      ).resolves.toMatchObject({ status: 404 });
    } finally {
      await server.close();
    }
  });

  it("requires a caller and validates bounded JSON input", async () => {
    const server = await startTestServer();
    try {
      expect(
        (await request(server, "/api/v1/turns", { method: "POST", body: {} }))
          .status,
      ).toBe(401);
      const malformed = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: "{",
      });
      expect(malformed.status).toBe(400);
      const configured = await startTestServer(
        new InMemoryRunManager({
          sha256,
          config,
          gateway: scripted([]),
        }),
      );
      try {
        const invalid = await request(configured, "/api/v1/turns", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: "{",
        });
        expect(invalid).toMatchObject({
          status: 400,
          body: JSON.stringify({ error: "invalid_json" }),
        });
        const invalidTurn = await request(configured, "/api/v1/turns", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: {},
        });
        expect(invalidTurn).toMatchObject({
          status: 400,
          body: JSON.stringify({ error: "invalid_turn" }),
        });
        const oversized = await request(configured, "/api/v1/turns", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: { session_key: "large", input: "x".repeat(1_100_000) },
        });
        expect(oversized).toMatchObject({
          status: 413,
          body: JSON.stringify({ error: "payload_too_large" }),
        });
      } finally {
        await configured.close();
      }
    } finally {
      await server.close();
    }
  });

  it("starts interactive turns and exposes caller-scoped session/status", async () => {
    const manager = new InMemoryRunManager({
      sha256,
      config,
      gateway: scripted([{ type: "text", text: "hello" }]),
    });
    const server = await startTestServer(manager);
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:one", input: "hello" },
      });
      expect(started.status).toBe(202);
      expect(started.headers["content-location"]).toBe(
        `/api/v1/runs/${(JSON.parse(started.body) as { run_id: string }).run_id}`,
      );
      const body = JSON.parse(started.body) as {
        run_id: string;
        session_id: string;
        events_url: string;
      };
      expect(body.events_url).toBe(`/api/v1/runs/${body.run_id}/events`);
      await waitForStatus(server, body.run_id, "completed");
      const completed = await request(
        server,
        `/api/v1/runs/${body.run_id}/status`,
        {
          headers: { "x-caller-id": "alice" },
        },
      );
      expect(JSON.parse(completed.body)).toMatchObject({
        run_id: body.run_id,
        status: "completed",
        response_text: "hello",
      });
      const session = await request(server, "/api/v1/sessions?key=chat%3Aone", {
        headers: { "x-caller-id": "alice" },
      });
      expect(JSON.parse(session.body)).toMatchObject({
        id: body.session_id,
        key: "chat:one",
        mode: "interactive",
        turns: 1,
        pending_question: null,
      });
      expect(
        (
          await request(server, `/api/v1/runs/${body.run_id}/status`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("exposes owner-scoped durable run evidence endpoints", async () => {
    const manifests: Array<{
      owner: string;
      runId: string;
      manifest: unknown;
    }> = [];
    const store = new InMemoryRuntimeStore();
    const evidence: RunEvidencePort = {
      async saveManifest(owner, record) {
        manifests.push({
          owner,
          runId: record.runId,
          manifest: record.manifest,
        });
      },
      async getManifest(owner, runId) {
        const record = manifests.find(
          (item) => item.owner === owner && item.runId === runId,
        );
        return record === undefined
          ? undefined
          : { runId, manifest: record.manifest, createdAt: "now" };
      },
      async listTrace(owner, runId) {
        const run = store.getRun(runId);
        if (!run || store.getSession(run.sessionId)?.owner !== owner) return [];
        return store.replay(runId, 0, 500).map((event) => ({
          runId: event.runId as never,
          seq: event.seq,
          event: event.payload,
          createdAt: run.createdAt,
        }));
      },
      async listValidations(owner, runId) {
        const run = store.getRun(runId);
        return !run ||
          store.getSession(run.sessionId)?.owner !== owner ||
          !run.finishedAt
          ? []
          : [
              {
                runId: run.id as never,
                name: "run_status",
                passed: run.status === "completed",
                details: { status: run.status },
                createdAt: run.finishedAt,
              },
            ];
      },
      async getReport(owner, runId) {
        const run = store.getRun(runId);
        return !run ||
          store.getSession(run.sessionId)?.owner !== owner ||
          !run.finishedAt
          ? undefined
          : {
              runId: run.id as never,
              markdown: run.responseText,
              artifactId: `${run.id}:report`,
              byteSize: Buffer.byteLength(run.responseText, "utf8"),
              createdAt: run.finishedAt,
            };
      },
    };
    const server = await startTestServer({
      runtime: new InMemoryRunManager({
        sha256,
        config,
        store,
        gateway: scripted([{ type: "text", text: "durable answer" }]),
        evidence,
      }),
      evidence,
    });
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          session_key: "chat:evidence",
          input: "hello",
          agent: "chat-assistant",
        },
      });
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;
      await waitForStatus(server, runId, "completed");
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/manifest`, {
            headers: { "x-caller-id": "alice" },
          })
        ).status,
      ).toBe(200);
      expect(
        JSON.parse(
          (
            await request(server, `/api/v1/runs/${runId}/trace`, {
              headers: { "x-caller-id": "alice" },
            })
          ).body,
        ).events.length,
      ).toBeGreaterThan(0);
      const firstTracePage = await request(
        server,
        `/api/v1/runs/${runId}/trace?limit=1`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(JSON.parse(firstTracePage.body).events).toHaveLength(1);
      expect(JSON.parse(firstTracePage.body).next_cursor).toBeDefined();
      const validation = await request(
        server,
        `/api/v1/runs/${runId}/validation`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(JSON.parse(validation.body)).toMatchObject({
        validations: [
          {
            name: "run_status",
            passed: true,
            details: { status: "completed" },
            created_at: expect.any(String),
          },
        ],
      });
      const report = await request(server, `/api/v1/runs/${runId}/report`, {
        headers: { "x-caller-id": "alice" },
      });
      expect(JSON.parse(report.body)).toMatchObject({
        markdown: "durable answer",
        artifact_id: `${runId}:report`,
        byte_size: Buffer.byteLength("durable answer", "utf8"),
        created_at: expect.any(String),
      });
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/files`, {
            headers: { "x-caller-id": "alice" },
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/trace`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/validation`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(server, `/api/v1/runs/${runId}/report`, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("accepts a matching owner-scoped client tool result and resumes the session", async () => {
    const requests: Parameters<ChatCompletionGateway["stream"]>[0][] = [];
    const manager = new InMemoryRunManager({
      sha256,
      config,
      clientTools: [
        {
          name: "RenderPreview",
          description: "Render markdown in the client.",
          parameters: { type: "object" },
        },
      ],
      gateway: {
        async *stream(modelRequest) {
          requests.push(modelRequest);
          if (requests.length === 1) {
            yield {
              type: "tool_call",
              call: {
                id: "preview",
                name: "RenderPreview",
                arguments: '{"markdown":"# Draft"}',
              },
            };
            return;
          }
          yield { type: "text", text: "Preview received." };
        },
      },
    });
    const server = await startTestServer(manager);
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:preview", input: "preview this" },
      });
      const initialRunId = (JSON.parse(started.body) as { run_id: string })
        .run_id;
      await waitForStatus(server, initialRunId, "awaiting_client_tool");

      const session = await request(
        server,
        "/api/v1/sessions?key=chat%3Apreview",
        {
          headers: { "x-caller-id": "alice" },
        },
      );
      expect(JSON.parse(session.body)).toMatchObject({
        pending_client_tool: { id: "preview", name: "RenderPreview" },
        pending_plan: null,
      });

      const mismatched = await request(server, "/api/v1/client-tool-results", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          session_key: "chat:preview",
          tool_call_id: "other",
          content: "<rendered />",
        },
      });
      expect(mismatched).toMatchObject({
        status: 409,
        body: JSON.stringify({ error: "invalid_client_tool_result" }),
      });

      expect(
        (
          await request(server, "/api/v1/client-tool-results", {
            method: "POST",
            headers: { "x-caller-id": "bob" },
            body: {
              session_key: "chat:preview",
              tool_call_id: "preview",
              content: "<rendered />",
            },
          })
        ).status,
      ).toBe(404);

      const resumed = await request(server, "/api/v1/client-tool-results", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          session_key: "chat:preview",
          tool_call_id: "preview",
          content: "<rendered />",
        },
      });
      expect(resumed.status).toBe(202);
      const resumedRunId = (JSON.parse(resumed.body) as { run_id: string })
        .run_id;
      await waitForStatus(server, resumedRunId, "completed");
      expect(
        requests[1]?.messages.filter(
          (message) =>
            message.role === "tool" && message.tool_call_id === "preview",
        ),
      ).toContainEqual(expect.objectContaining({ content: "<rendered />" }));
    } finally {
      await server.close();
    }
  });

  it("deduplicates webhook deliveries and preserves trigger scoping", async () => {
    let calls = 0;
    const manager = new InMemoryRunManager({
      sha256,
      config,
      gateway: {
        async *stream() {
          calls += 1;
          yield { type: "text", text: "ok" };
        },
      },
    });
    const server = await startTestServer(manager);
    try {
      const input = { session_key: "hook:one", input: "run" };
      const first = await request(server, "/api/v1/webhooks/github", {
        method: "POST",
        headers: { "x-caller-id": "alice", "x-delivery-id": "d1" },
        body: input,
      });
      const duplicate = await request(server, "/api/v1/webhooks/github", {
        method: "POST",
        headers: { "x-caller-id": "alice", "x-delivery-id": "d1" },
        body: input,
      });
      expect(first.status).toBe(202);
      expect(duplicate).toMatchObject({
        status: 200,
        body: JSON.stringify({ status: "duplicate_delivery" }),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(calls).toBe(1);
      expect(
        (
          await request(server, "/api/v1/sessions?key=hook%3Aone", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import { Controller, Get, Module, StreamableFile } from "@nestjs/common";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import { AppModule } from "@bootstrap/app.module.js";
import {
  parseListenAddress,
  redactStartupError,
} from "@presentation/http/adapter.js";
import { createHttpApplication } from "@bootstrap/http-main.js";

@Controller({ version: "2" })
class V2ProbeController {
  @Get("probe")
  probe(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("download")
  download(): StreamableFile {
    return new StreamableFile(Buffer.from("download"), {
      type: "text/plain",
    });
  }
}

@Module({ controllers: [V2ProbeController] })
class V2ProbeModule {}

interface ListeningServer {
  address(): { port: number } | string | null;
}

async function request(
  port: number,
  path: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  status: number;
  contentType: string | undefined;
  headers: Record<string, string>;
  body: string;
}> {
  const body = options.body;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...(body === undefined ? {} : { body }),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? undefined,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

describe("Nest HTTP compatibility adapter", () => {
  it("preserves request correlation on streamed file responses", async () => {
    const app = await createHttpApplication({ module: V2ProbeModule });
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      await expect(
        request(address.port, "/api/v2/download", {
          headers: { "x-request-id": "download-request-1" },
        }),
      ).resolves.toMatchObject({
        status: 200,
        body: "download",
        headers: { "x-request-id": "download-request-1" },
      });
    } finally {
      await app.close();
    }
  });

  it("registers an explicit v2 controller under /api/v2", async () => {
    const app = await createHttpApplication({ module: V2ProbeModule });
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      expect(await request(address.port, "/api/v2/probe")).toMatchObject({
        status: 200,
        body: '{"status":"ok"}',
      });
      expect(await request(address.port, "/api/v1/probe")).toMatchObject({
        status: 404,
      });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unrecognized versioned routes", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      await expect(
        request(address.port, "/api/v1/runs/unmigrated"),
      ).resolves.toMatchObject({
        status: 404,
      });
      await expect(
        request(address.port, "/api/v1/not-found"),
      ).resolves.toMatchObject({
        status: 404,
      });
    } finally {
      await app.close();
    }
  });

  it("uses the current listen-address validation", () => {
    expect(parseListenAddress(undefined)).toEqual({
      host: "127.0.0.1",
      port: 8080,
    });
    expect(parseListenAddress("0.0.0.0:18080")).toEqual({
      host: "0.0.0.0",
      port: 18080,
    });
    expect(() => parseListenAddress("0.0.0.0:0")).toThrow(
      "Invalid MINDER_SERVE_ADDR.",
    );
  });

  it("redacts credentials from startup errors", () => {
    expect(
      redactStartupError(
        new Error("postgresql://minder:secret@example.test:5432/minder"),
      ),
    ).toBe("postgresql://minder:<redacted>@example.test:5432/minder");
  });

  it("serves the production operational and versioned paths through Nest", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      const supplied = await request(address.port, "/api/v1/healthz", {
        headers: { "x-request-id": " frontend-request-1 " },
      });
      expect(supplied.headers["x-request-id"]).toBe("frontend-request-1");
      expect(supplied.body).toBe('{"status":"ok"}');
      const generated = await request(address.port, "/healthz");
      expect(generated.headers["x-request-id"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      );
      const error = await request(address.port, "/api/v2/not-found");
      expect(error.headers["x-request-id"]).toBeDefined();
      expect(JSON.parse(error.body)).toMatchObject({
        request_id: error.headers["x-request-id"],
      });
      const v1Error = await request(address.port, "/api/v1/not-found");
      expect(v1Error).toMatchObject({
        status: 404,
      });
      expect(JSON.parse(v1Error.body)).not.toHaveProperty("request_id");
      await expect(
        request(address.port, "/api/v1/healthz", {
          method: "OPTIONS",
          headers: { origin: "https://console.example.test" },
        }),
      ).resolves.toMatchObject({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
          "access-control-allow-headers":
            expect.stringContaining("x-request-id"),
          "access-control-expose-headers": "x-request-id",
          "x-request-id": expect.any(String),
        },
      });
      await expect(request(address.port, "/healthz")).resolves.toMatchObject({
        status: 200,
        body: '{"status":"ok"}',
      });
      await expect(request(address.port, "/metrics")).resolves.toMatchObject({
        status: 200,
        contentType: "text/plain; charset=utf-8; version=0.0.4",
      });
      await expect(request(address.port, "/stats")).resolves.toMatchObject({
        status: 200,
        contentType: "application/json; charset=utf-8",
      });
      await expect(
        request(address.port, "/api/v1/turns", { method: "POST", body: "{}" }),
      ).resolves.toMatchObject({
        status: 401,
        body: '{"error":"missing_caller_id"}',
      });
      await expect(
        request(address.port, "/api/v1/not-found"),
      ).resolves.toMatchObject({
        status: 404,
      });
    } finally {
      await app.close();
    }
  });

  it("serves agent configuration through a native Nest controller", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      await expect(
        request(address.port, "/api/v1/agents", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: JSON.stringify({
            executionStrategy: "react",
            id: "validated-agent",
            name: "validated-agent",
            skills: [],
            toolAllowlist: [],
            unexpected: true,
          }),
        }),
      ).resolves.toMatchObject({ status: 400 });
      await expect(
        request(address.port, "/api/v1/agents", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: JSON.stringify({
            executionStrategy: "react",
            id: "reviewer",
            name: "reviewer",
            skills: [],
            toolAllowlist: [],
          }),
        }),
      ).resolves.toMatchObject({ status: 201 });
      await expect(
        request(address.port, "/api/v1/agents/reviewer", {
          headers: { "x-caller-id": "alice" },
        }),
      ).resolves.toMatchObject({ status: 200 });
      const invalid = await request(address.port, "/api/v1/agents", {
        method: "POST",
        headers: { "x-caller-id": "alice", "content-type": "application/json" },
        body: "{",
      });
      expect(invalid.status).toBe(400);
      expect(JSON.parse(invalid.body)).toMatchObject({ error: "invalid_json" });
      await expect(
        request(address.port, "/api/v1/agents/reviewer/archive", {
          method: "POST",
          headers: { "x-caller-id": "alice" },
        }),
      ).resolves.toMatchObject({ status: 200 });
    } finally {
      await app.close();
    }
  });

  it("serves room routes through native Nest controllers", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      const created = await request(address.port, "/api/v1/rooms", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: JSON.stringify({
          name: "Native room",
          max_concurrent_runs: 1,
          members: ["chat-assistant"],
        }),
      });
      expect(created.status).toBe(201);
      const roomId = (JSON.parse(created.body) as { id: string }).id;
      await expect(
        request(address.port, `/api/v1/rooms/${roomId}`, {
          headers: { "x-caller-id": "alice" },
        }),
      ).resolves.toMatchObject({ status: 200 });
    } finally {
      await app.close();
    }
  });

  it("serves replay and terminal SSE events through the production Nest path", async () => {
    const gateway = {
      async *stream(): AsyncIterable<ModelStreamEvent> {
        yield { type: "text", text: "hello" };
      },
    } satisfies ChatCompletionGateway;
    const app = await createHttpApplication(
      AppModule.register({
        environment: {
          LLM_BASE_URL: "http://example.test",
          LLM_API_KEY: "test-key",
          LLM_MODEL: "test-model",
        },
        authOptions: {},
        factories: {
          createGateway: async () => gateway,
          createWorkspaceProvider: async () => ({
            resolve: async () => ({ root: "/tmp/workspace", prefix: "" }),
            resolvePath: async (root: string, path: string) =>
              `${root}/${path}`,
            sync: async () => undefined,
            tree: async () => ({ entries: [] }),
            read: async () => undefined,
            readSession: async () => undefined,
          }),
          createMcpManager: () => ({ close: async () => undefined }) as never,
        },
      }),
    );
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as ListeningServer).address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Nest did not expose a TCP address");
    }
    try {
      const started = await request(address.port, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: JSON.stringify({ session_key: "chat:nest-sse", input: "hello" }),
      });
      expect(started.status).toBe(202);
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;

      const stream = await request(
        address.port,
        `/api/v1/runs/${runId}/events?from=0`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(stream.status).toBe(200);
      expect(stream.contentType).toMatch(/^text\/event-stream/);
      expect(stream.body).toContain("event: text\nid: 1");
      expect(stream.body).toContain(
        'event: done\nid: 2\ndata: {"type":"done","data":{"response_text":"hello"}}',
      );

      const replay = await request(
        address.port,
        `/api/v1/runs/${runId}/events`,
        {
          headers: { "x-caller-id": "alice", "last-event-id": "1" },
        },
      );
      expect(replay.status).toBe(200);
      expect(replay.body).toContain("event: done\nid: 2");
      expect(replay.body).not.toContain("event: text\nid: 1");
    } finally {
      await app.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  createMcpClient,
  createMcpTransport,
  RemoteMcpTransport,
  StdioMcpTransport,
  targetsForManifest,
  type McpTransport,
  type McpToolDescriptor,
} from "@infrastructure/mcp";

class FakeMcpTransport implements McpTransport {
  readonly requests: Array<{
    method: string;
    params: Record<string, unknown>;
  }> = [];
  closed = false;

  constructor(
    private readonly tools: readonly McpToolDescriptor[] = [
      {
        name: "query",
        description: "Query the warehouse.",
        inputSchema: { type: "object" },
      },
    ],
  ) {}

  async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "tools/list") return { tools: this.tools };
    if (method === "tools/call")
      return { content: [{ type: "text", text: "ok" }] };
    return {};
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe("scoped MCP client", () => {
  it("preserves Streamable HTTP headers and session IDs", async () => {
    const requests: Array<{ method: string; headers: Headers }> = [];
    const transport = new RemoteMcpTransport({
      url: "https://mcp.example.test",
      headers: { "x-mcp-shared-secret": "test-secret" },
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers);
        const bodyText =
          init?.body == null ? "" : await new Response(init.body).text();
        const body = JSON.parse(bodyText) as { method: string; id?: number };
        requests.push({ method: body.method, headers });
        const responseBody =
          body.method === "initialize"
            ? JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: "2025-06-18",
                  capabilities: {},
                  serverInfo: { name: "fixture", version: "1.0.0" },
                },
              })
            : body.method === "tools/list"
              ? JSON.stringify({
                  jsonrpc: "2.0",
                  id: body.id,
                  result: { tools: [] },
                })
              : "";
        return new Response(responseBody, {
          headers: {
            "content-type": "application/json",
            ...(body.method === "initialize"
              ? { "mcp-session-id": "session-1" }
              : {}),
          },
        });
      },
    });

    await transport.request("tools/list", {}, new AbortController().signal);

    expect(requests.map((request) => request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(requests[0]?.headers.get("accept")).toBe(
      "application/json, text/event-stream",
    );
    expect(requests[0]?.headers.get("x-mcp-shared-secret")).toBe("test-secret");
    expect(requests[2]?.headers.get("mcp-session-id")).toBe("session-1");
  });

  it("supports stateless Streamable HTTP MCP servers without a session id", async () => {
    const requests: Array<{ method: string; headers: Headers }> = [];
    const transport = new RemoteMcpTransport({
      url: "https://mcp.example.test",
      headers: {},
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers);
        const body = JSON.parse(
          await new Response(init?.body ?? "").text(),
        ) as { method: string; id?: number };
        requests.push({ method: body.method, headers });
        const responseBody =
          body.method === "initialize"
            ? JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: "2025-06-18",
                  capabilities: {},
                  serverInfo: { name: "fixture", version: "1.0.0" },
                },
              })
            : body.method === "tools/list"
              ? JSON.stringify({
                  jsonrpc: "2.0",
                  id: body.id,
                  result: { tools: [] },
                })
              : "";
        return new Response(responseBody, {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    await transport.request("tools/list", {}, new AbortController().signal);

    expect(requests.map((request) => request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(requests[2]?.headers.has("mcp-session-id")).toBe(false);
  });

  it("creates the configured transport without starting network or child work", () => {
    const stdio = createMcpTransport({
      kind: "stdio",
      command: "mcp-server",
      args: [],
      env: {},
      discoveryAllowlist: [],
    });
    const remote = createMcpTransport({
      kind: "remote",
      url: "https://mcp.example.test",
      headers: {},
      discoveryAllowlist: [],
    });

    expect(stdio).toBeInstanceOf(StdioMcpTransport);
    expect(remote).toBeInstanceOf(RemoteMcpTransport);
  });

  it("uses a lazy SDK stdio client for discovery, calls, abort, and close", async () => {
    const server = String.raw`
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const request = JSON.parse(line);
        if (request.method === "notifications/initialized") return;
        if (request.method === "tools/call" && request.params?.name === "slow") return;
        const result = request.method === "initialize"
          ? { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fixture", version: "1.0.0" } }
          : request.method === "tools/list"
            ? { tools: [{ name: "query", description: "Query", inputSchema: { type: "object" } }] }
            : { content: [{ type: "text", text: "ok" }], _meta: request.params?._meta };
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
      });
    `;
    const transport = new StdioMcpTransport({
      command: process.execPath,
      args: ["-e", server],
      env: { MINDER_STDIO_FIXTURE: "1" },
    });

    const tools = await transport.request(
      "tools/list",
      {},
      new AbortController().signal,
    );
    expect(tools).toMatchObject({ tools: [{ name: "query" }] });

    await expect(
      transport.request(
        "tools/call",
        {
          name: "query",
          arguments: {},
          _meta: { "com.minder/run-id": "run-stdio" },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
      _meta: { "com.minder/run-id": "run-stdio" },
    });

    const controller = new AbortController();
    const pending = transport.request(
      "tools/call",
      { name: "slow", arguments: {} },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });

    await transport.close();
    await transport.close();
  });

  it("turns one manifest's MCP servers into owner-scoped startup targets", () => {
    expect(
      targetsForManifest({
        owner: "tenant-a/alice",
        agent: "analyst",
        mcpServers: {
          warehouse: {
            kind: "remote",
            url: "https://mcp.example.test",
            headers: {},
            discoveryAllowlist: ["query"],
          },
        },
        scope: { allowedCatalogs: ["public"] },
      }),
    ).toEqual([
      expect.objectContaining({
        owner: "tenant-a/alice",
        agent: "analyst",
        server: expect.objectContaining({ name: "warehouse" }),
      }),
    ]);
  });

  it("qualifies discovered descriptors as server:tool", async () => {
    const transport = new FakeMcpTransport();
    const client = createMcpClient({
      server: "warehouse",
      transport,
      scope: { allowedCatalogs: ["public"] },
    });
    const tools = await client.discover();
    expect(tools.map((tool) => tool.name)).toContain("warehouse:query");
  });

  it("does not call transport for a denied catalog", async () => {
    const transport = new FakeMcpTransport();
    const client = createMcpClient({
      server: "warehouse",
      transport,
      scope: { allowedCatalogs: ["public"] },
    });
    const result = await client.call({
      name: "warehouse:query",
      arguments: { catalog: "private" },
    });
    expect(result).toMatchObject({ code: "mcp_scope_denied" });
    expect(
      transport.requests.filter((entry) => entry.method === "tools/call"),
    ).toHaveLength(0);
  });

  it("invokes the transport for an allowed catalog and closes on demand", async () => {
    const transport = new FakeMcpTransport();
    const client = createMcpClient({
      server: "warehouse",
      transport,
      scope: { allowedCatalogs: ["public"] },
    });
    const result = await client.call({
      name: "warehouse:query",
      arguments: { catalog: "public" },
    });
    expect(result).toMatchObject({ success: true });
    expect(
      transport.requests.filter((entry) => entry.method === "tools/call"),
    ).toHaveLength(1);
    await client.close();
    expect(transport.closed).toBe(true);
  });
});

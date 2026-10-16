import { describe, expect, it } from "vitest";
import { createMcpServerManager, type McpTransport } from "@infrastructure/mcp";

class FakeTransport implements McpTransport {
  closed = false;
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> =
    [];

  async request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    this.calls.push({ method, ...(params === undefined ? {} : { params }) });
    if (method === "tools/list") {
      return {
        tools: [
          {
            name: "query",
            description: "Query data",
            inputSchema: { type: "object" },
          },
          {
            name: "admin",
            description: "Administrative action",
            inputSchema: { type: "object" },
          },
        ],
      };
    }
    return { content: [{ text: "ok" }] };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe("McpServerManager", () => {
  it("caches connections by owner, agent, and server while exposing only allowlisted tools", async () => {
    const transports: FakeTransport[] = [];
    const manager = createMcpServerManager({
      createTransport: () => {
        const transport = new FakeTransport();
        transports.push(transport);
        return transport;
      },
    });
    const input = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };

    const [first, second] = await Promise.all([
      manager.discover(input),
      manager.discover(input),
    ]);

    expect(first).toEqual([
      expect.objectContaining({ name: "mcp__warehouse__query" }),
    ]);
    expect(second).toEqual(first);
    expect(transports).toHaveLength(1);
    await manager.closeOwner("alice");
    expect(transports[0]?.closed).toBe(true);
  });

  it("denies direct calls outside the discovery allowlist", async () => {
    const transport = new FakeTransport();
    const manager = createMcpServerManager({
      createTransport: () => transport,
    });
    const target = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: {},
    };

    await manager.discover(target);
    const result = await manager.call(target, "mcp__warehouse__admin", {});

    expect(result).toMatchObject({
      success: false,
      code: "mcp_unknown_tool",
    });
    expect(
      transport.calls.filter((entry) => entry.method === "tools/call"),
    ).toHaveLength(0);
  });

  it("connects targets eagerly and returns owner-scoped status without secrets", async () => {
    const transports: FakeTransport[] = [];
    const manager = createMcpServerManager({
      createTransport: () => {
        const transport = new FakeTransport();
        transports.push(transport);
        return transport;
      },
    });
    const alice = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: { authorization: "Bearer secret" },
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };
    const bob = { ...alice, owner: "bob" };

    await manager.connectAll([alice, bob]);

    expect(await manager.status("alice")).toEqual([
      expect.objectContaining({
        owner: "alice",
        agent: "analyst",
        server: "warehouse",
        state: "ready",
        toolCount: 1,
      }),
    ]);
    expect(await manager.status("bob")).toEqual([
      expect.objectContaining({ owner: "bob", state: "ready" }),
    ]);
    expect(JSON.stringify(await manager.status("alice"))).not.toContain(
      "secret",
    );
    expect(transports).toHaveLength(2);
  });

  it("mounts discovered MCP tools and forwards only trusted runtime metadata", async () => {
    const transport = new FakeTransport();
    const manager = createMcpServerManager({
      createTransport: () => transport,
    });
    const target = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };

    const tools = await manager.toolsForAgent(target);
    const result = await tools[0]!.execute?.(
      { catalog: "public", callerSubject: "model-forged" },
      {
        workspaceRoot: "/tmp",
        workingDirectory: "/tmp",
        signal: new AbortController().signal,
        runId: "run-1",
        authorizationRunId: "40000000-0000-4000-8000-000000000001",
        roomId: "room-1",
        callerSubject: "user-1",
      },
    );

    expect(result?.success).toBe(true);
    const call = transport.calls.find((entry) => entry.method === "tools/call");
    expect(call?.params).toMatchObject({
      name: "query",
      arguments: { catalog: "public", callerSubject: "model-forged" },
      _meta: {
        "com.minder/owner": "alice",
        "com.minder/agent": "analyst",
        "com.minder/run-id": "run-1",
        "com.celesnity/authorization-run-id":
          "40000000-0000-4000-8000-000000000001",
        "com.minder/room-id": "room-1",
        "com.minder/caller-subject": "user-1",
        "com.celesnity/room-id": "room-1",
        "com.celesnity/caller-subject": "user-1",
      },
    });
  });

  it("forwards the verified automation run binding to Core tools", async () => {
    const transport = new FakeTransport();
    const manager = createMcpServerManager({
      createTransport: () => transport,
    });
    const tools = await manager.toolsForAgent({
      owner: "organization-owner",
      agent: "workflow-agent",
      server: {
        name: "warehouse",
        config: {
          kind: "remote",
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: {},
    });
    await tools[0]!.execute?.(
      {},
      {
        workspaceRoot: "/tmp",
        workingDirectory: "/tmp",
        signal: new AbortController().signal,
        runId: "40000000-0000-4000-8000-000000000001",
        automationRunId: "40000000-0000-4000-8000-000000000001",
        automationOrganizationId: "20000000-0000-4000-8000-000000000001",
      },
    );
    expect(
      transport.calls.find((entry) => entry.method === "tools/call")?.params,
    ).toMatchObject({
      _meta: {
        "com.celesnity/automation-run-id":
          "40000000-0000-4000-8000-000000000001",
        "com.celesnity/automation-organization-id":
          "20000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("audits MCP tool errors as failed rather than denied", async () => {
    const events: unknown[] = [];
    const manager = createMcpServerManager({
      auditSink: (event) => {
        events.push(event);
      },
      createTransport: () => ({
        async request(method: string): Promise<unknown> {
          if (method === "tools/list") {
            return {
              tools: [
                {
                  name: "query",
                  description: "Query data",
                  inputSchema: { type: "object" },
                },
              ],
            };
          }
          return {
            isError: true,
            content: [{ type: "text", text: "remote tool failed" }],
          };
        },
        async close() {},
      }),
    });
    const target = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: {},
    };

    await manager.discover(target);
    const result = await manager.call(
      target,
      "mcp__warehouse__query",
      {},
      undefined,
      { runId: "run-1" },
    );

    expect(result).toMatchObject({ success: false, code: "mcp_tool_error" });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "call",
        status: "failed",
        code: "mcp_tool_error",
      }),
    );
  });

  it("does not retry a failed MCP call after its outcome is unknown", async () => {
    const transports: FakeTransport[] = [];
    let callAttempts = 0;
    const manager = createMcpServerManager({
      requestTimeoutMs: 20,
      createTransport: () => {
        const transport = new FakeTransport();
        transports.push(transport);
        const originalRequest = transport.request.bind(transport);
        transport.request = async (method, params) => {
          if (method === "tools/call") {
            callAttempts += 1;
            throw new Error("response_lost");
          }
          return originalRequest(method, params);
        };
        return transport;
      },
    });
    const target = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };
    await manager.discover(target);

    await expect(
      manager.call(target, "mcp__warehouse__query", { catalog: "public" }),
    ).rejects.toThrow("response_lost");
    expect(callAttempts).toBe(1);
    expect(transports).toHaveLength(1);
  });

  it("aborts the underlying call when the request timeout expires", async () => {
    let callSignal: AbortSignal | undefined;
    let closed = false;
    const manager = createMcpServerManager({
      requestTimeoutMs: 20,
      createTransport: (): McpTransport => ({
        async request(method, _params, signal): Promise<unknown> {
          if (method === "tools/list") {
            return {
              tools: [
                {
                  name: "query",
                  description: "Query data",
                  inputSchema: { type: "object" },
                },
              ],
            };
          }
          callSignal = signal;
          return new Promise<never>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("request_aborted")),
              { once: true },
            );
          });
        },
        async close() {
          closed = true;
        },
      }),
    });
    const target = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };
    await manager.discover(target);

    await expect(
      manager.call(target, "mcp__warehouse__query", { catalog: "public" }),
    ).rejects.toThrow("mcp_call_timeout_20ms");
    expect(callSignal?.aborted).toBe(true);
    expect(closed).toBe(true);
  });

  it("does not reuse a client across different run data scopes", async () => {
    const transports: FakeTransport[] = [];
    const manager = createMcpServerManager({
      createTransport: () => {
        const transport = new FakeTransport();
        transports.push(transport);
        return transport;
      },
    });
    const base = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote" as const,
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: [],
        },
      },
    };
    await manager.discover({
      ...base,
      scope: { dataScope: { catalog: "iceberg", schema: "demo" } },
    });
    await manager.discover({
      ...base,
      scope: { dataScope: { catalog: "iceberg", schema: "sales" } },
    });
    expect(transports).toHaveLength(2);
    await manager.close();
  });
});

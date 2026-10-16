import { describe, expect, it } from "vitest";
import { organizationScopeKey } from "@domain/index.js";
import type { McpServerManager, McpManagerTarget } from "@infrastructure/mcp";
import { request, startTestServer } from "./harness.js";

const target: McpManagerTarget = {
  owner: "alice",
  agent: "analyst",
  server: {
    name: "warehouse",
    config: {
      kind: "remote",
      url: "https://mcp.example.test",
      headers: {},
      discoveryAllowlist: ["query"],
    },
  },
  scope: { allowedCatalogs: ["public"] },
};

function manager(): McpServerManager {
  return {
    async connectAll() {
      return [];
    },
    async discover() {
      return [
        {
          name: "mcp__warehouse__query",
          description: "Query data",
          inputSchema: { type: "object" },
        },
      ];
    },
    async toolsForAgent() {
      return [];
    },
    async call() {
      return { success: true, content: "ok", metadata: {} };
    },
    async status(owner) {
      return owner === "alice"
        ? [
            {
              owner: "alice",
              agent: "analyst",
              server: "warehouse",
              kind: "remote",
              state: "ready",
              toolCount: 1,
              attempts: 1,
            },
          ]
        : [];
    },
    async reconnect() {
      return {
        owner: "alice",
        agent: "analyst",
        server: "warehouse",
        kind: "remote",
        state: "ready",
        toolCount: 1,
        attempts: 2,
      };
    },
    async closeOwner() {},
    async close() {},
  };
}

describe("MCP server HTTP API", () => {
  it("requires an authenticated caller", async () => {
    const server = await startTestServer({ mcpManager: manager() });
    try {
      const response = await request(server, "/api/v1/mcp/servers");
      expect(response.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("returns only the authenticated owner's server status", async () => {
    const server = await startTestServer({ mcpManager: manager() });
    try {
      const response = await request(server, "/api/v1/mcp/servers", {
        headers: { "x-caller-id": "alice" },
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual([
        {
          agent: "analyst",
          attempts: 1,
          kind: "remote",
          server: "warehouse",
          state: "ready",
          tool_count: 1,
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("discovers tools and reconnects through an owner-bound target", async () => {
    const calls: string[] = [];
    const server = await startTestServer({
      mcpManager: manager(),
      mcpTargetResolver: ({ owner, agent, server }) => {
        calls.push(`${owner}:${agent}:${server}`);
        return target;
      },
    });
    try {
      const tools = await request(
        server,
        "/api/v1/mcp/servers/warehouse/tools?agent=analyst",
        { headers: { "x-caller-id": "alice" } },
      );
      expect(tools.status).toBe(200);
      expect(JSON.parse(tools.body)).toEqual([
        {
          description: "Query data",
          input_schema: { type: "object" },
          name: "mcp__warehouse__query",
        },
      ]);

      const reconnect = await request(
        server,
        "/api/v1/mcp/servers/warehouse/reconnect?agent=analyst",
        { method: "POST", headers: { "x-caller-id": "alice" } },
      );
      expect(reconnect.status).toBe(200);
      expect(JSON.parse(reconnect.body)).toMatchObject({ state: "ready" });
      expect(calls).toEqual([
        "alice:analyst:warehouse",
        "alice:analyst:warehouse",
      ]);
    } finally {
      await server.close();
    }
  });

  it("resolves manifest MCP targets by organization while keeping status user-scoped", async () => {
    const manifestOwner = organizationScopeKey({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
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
    const owners: string[] = [];
    const server = await startTestServer({
      authOptions: { authenticator },
      mcpManager: manager(),
      mcpTargetResolver: ({ owner }) => {
        owners.push(owner);
        return { ...target, owner };
      },
    });
    try {
      const response = await request(
        server,
        "/api/v1/mcp/servers/warehouse/tools?agent=analyst",
        { headers: { authorization: "Bearer assertion" } },
      );
      expect(response.status).toBe(200);
      expect(owners).toEqual([manifestOwner]);
    } finally {
      await server.close();
    }
  });

  it("rejects a resolver target that crosses the authenticated owner", async () => {
    const server = await startTestServer({
      mcpManager: manager(),
      mcpTargetResolver: () => ({ ...target, owner: "bob" }),
    });
    try {
      const response = await request(
        server,
        "/api/v1/mcp/servers/warehouse/tools?agent=analyst",
        { headers: { "x-caller-id": "alice" } },
      );
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

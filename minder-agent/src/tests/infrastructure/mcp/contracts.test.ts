import { describe, expect, it } from "vitest";
import {
  createMcpClient,
  resolveEnvironmentVariables,
  type McpTransport,
} from "@infrastructure/mcp";

class RecordingTransport implements McpTransport {
  readonly requests: Array<{ method: string }> = [];
  async request(method: string): Promise<unknown> {
    this.requests.push({ method });
    if (method === "tools/list")
      return {
        tools: [
          { name: "query", description: "q", inputSchema: { type: "object" } },
        ],
      };
    return method === "tools/call"
      ? {
          content: [{ type: "text", text: "ok" }],
          _meta: {
            message_block: {
              type: "chart",
              payload: { kind: "preview" },
            },
          },
        }
      : { content: [{ type: "text", text: "ok" }] };
  }
  async close(): Promise<void> {}
}

describe("MCP contracts", () => {
  it("propagates an MCP tool error instead of reporting success", async () => {
    const client = createMcpClient({
      server: "skill",
      transport: {
        async request() {
          return {
            isError: true,
            content: [{ type: "text", text: "minder-agent returned 404" }],
          };
        },
        async close() {},
      },
      scope: {},
    });

    await expect(
      client.call({ name: "skill:list_skills", arguments: {} }),
    ).resolves.toMatchObject({
      success: false,
      code: "mcp_tool_error",
      message: "minder-agent returned 404",
    });
  });

  it("trims resolved environment values without reading process state itself", () => {
    expect(
      resolveEnvironmentVariables("Bearer ${TOKEN}", { TOKEN: " value\n" }),
    ).toBe("Bearer value");
  });

  it("rejects a scoped MCP catalog before transport invocation", async () => {
    const transport = new RecordingTransport();
    const client = createMcpClient({
      server: "warehouse",
      transport,
      scope: { allowedCatalogs: ["public"] },
    });
    const result = await client.call({
      name: "warehouse:query",
      arguments: { catalog: "outside" },
    });
    expect(result).toMatchObject({ code: "mcp_scope_denied" });
    expect(
      transport.requests.filter((entry) => entry.method === "tools/call"),
    ).toHaveLength(0);
  });

  it("enforces the selected schema for direct arguments and SQL", async () => {
    const transport = new RecordingTransport();
    const client = createMcpClient({
      server: "warehouse",
      transport,
      scope: { dataScope: { catalog: "iceberg", schema: "demo" } },
    });

    await expect(
      client.call({
        name: "warehouse:list",
        arguments: { schema: "other" },
      }),
    ).resolves.toMatchObject({ code: "mcp_scope_denied" });
    await expect(
      client.call({
        name: "warehouse:query",
        arguments: { query: "select * from iceberg.other.orders" },
      }),
    ).resolves.toMatchObject({ code: "mcp_scope_denied" });
    await expect(
      client.call({
        name: "warehouse:query",
        arguments: { query: "select * from iceberg.demo.orders" },
      }),
    ).resolves.toMatchObject({ success: true });
    expect(
      transport.requests.filter((entry) => entry.method === "tools/call"),
    ).toHaveLength(1);
  });

  it("preserves MCP protocol result metadata", async () => {
    const client = createMcpClient({
      server: "warehouse",
      transport: new RecordingTransport(),
      scope: {},
    });

    await expect(
      client.call({ name: "warehouse:query", arguments: {} }),
    ).resolves.toMatchObject({
      success: true,
      metadata: {
        message_block: {
          type: "chart",
          payload: { kind: "preview" },
        },
      },
    });
  });
});

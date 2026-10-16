import { describe, expect, it } from "vitest";
import { RemoteMcpTransport } from "@infrastructure/mcp";

describe("SDK-backed MCP transport contract", () => {
  it("maps supported requests and rejects unsupported methods", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const transport = new RemoteMcpTransport({
      url: "https://mcp.example.test",
      headers: {},
      fetch: async (_input, init) => {
        const request = JSON.parse(
          await new Response(init?.body ?? "").text(),
        ) as Record<string, unknown>;
        requests.push(request);

        const result =
          request.method === "initialize"
            ? {
                protocolVersion: "2025-06-18",
                capabilities: {},
                serverInfo: { name: "fixture", version: "1.0.0" },
              }
            : request.method === "tools/list"
              ? { tools: [] }
              : { content: [{ type: "text", text: "ok" }] };
        return Response.json({ jsonrpc: "2.0", id: request.id, result });
      },
    });

    await expect(
      transport.request("tools/list", {}, new AbortController().signal),
    ).resolves.toEqual({ tools: [] });
    await expect(
      transport.request(
        "tools/call",
        {
          name: "query",
          arguments: { catalog: "public" },
          _meta: { "com.minder/run-id": "run-1" },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ content: [{ type: "text", text: "ok" }] });
    await expect(
      transport.request("resources/list", {}, new AbortController().signal),
    ).rejects.toThrow("mcp_unsupported_method");

    expect(requests.at(-1)?.method).toBe("tools/call");
    expect(requests.at(-1)?.params).toEqual({
      name: "query",
      arguments: { catalog: "public" },
      _meta: { "com.minder/run-id": "run-1" },
    });

    await transport.close();
  });
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpTransport } from "./transport.js";

export interface RemoteTransportConfig {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
}

/**
 * MCP transport over Streamable HTTP. The SDK owns initialization, sessions,
 * SSE parsing, and stateless operation. Network setup remains lazy and
 * configured headers are never logged.
 */
export class RemoteMcpTransport implements McpTransport {
  private client: Client | undefined;
  private sdkTransport: StreamableHTTPClientTransport | undefined;
  private connecting: Promise<Client> | undefined;

  constructor(private readonly config: RemoteTransportConfig) {}

  async request(
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (signal.aborted) throw abortError();
    if (method !== "tools/list" && method !== "tools/call")
      throw new Error("mcp_unsupported_method");

    const client = await this.ensureConnected(signal);
    if (method === "tools/list") return client.listTools(undefined, { signal });
    return client.callTool(
      params as Parameters<Client["callTool"]>[0],
      undefined,
      { signal },
    );
  }

  async close(): Promise<void> {
    const sdkTransport = this.sdkTransport;
    this.client = undefined;
    this.sdkTransport = undefined;
    this.connecting = undefined;
    if (sdkTransport) await sdkTransport.close();
  }

  private async ensureConnected(signal: AbortSignal): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    const client = new Client({ name: "minder-agent", version: "0.0.0" });
    const sdkTransport = new StreamableHTTPClientTransport(
      new URL(this.config.url),
      {
        requestInit: { headers: this.config.headers },
        fetch: this.config.fetch ?? fetch,
      },
    );
    this.sdkTransport = sdkTransport;
    const connecting = client
      .connect(sdkTransport as Parameters<Client["connect"]>[0], { signal })
      .then(() => {
        this.client = client;
        return client;
      });
    this.connecting = connecting;
    try {
      return await connecting;
    } catch (error) {
      if (this.connecting === connecting) this.connecting = undefined;
      await sdkTransport.close().catch(() => undefined);
      if (this.sdkTransport === sdkTransport) this.sdkTransport = undefined;
      throw error;
    }
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

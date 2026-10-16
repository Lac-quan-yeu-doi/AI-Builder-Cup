import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpTransport } from "./transport.js";

export interface StdioTransportConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * MCP transport over a child process. The SDK owns process and protocol
 * details; the client and transport are created lazily on the first request.
 */
export class StdioMcpTransport implements McpTransport {
  private client: Client | undefined;
  private sdkTransport: StdioClientTransport | undefined;
  private connecting: Promise<Client> | undefined;

  constructor(private readonly config: StdioTransportConfig) {}

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
    const sdkTransport = new StdioClientTransport({
      command: this.config.command,
      args: [...this.config.args],
      env: { ...process.env, ...this.config.env } as Record<string, string>,
      stderr: "pipe",
    });
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

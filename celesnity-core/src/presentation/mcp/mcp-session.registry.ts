import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Tracks one `StreamableHTTPServerTransport` per open MCP session —
 * `rmcp`'s client (used by minder-agent's `Remote` MCP config) speaks the
 * modern Streamable HTTP transport: every message (GET, POST, DELETE) goes
 * to the same endpoint, correlated by an `Mcp-Session-Id` header the server
 * assigns on the first (`initialize`) request.
 *
 * Replaces the legacy `McpSseSessionRegistry`/`SSEServerTransport` pairing
 * (deprecated upstream in `@modelcontextprotocol/sdk`) — that transport's
 * separate GET-stream/POST-messages split had an observed, unresolved race
 * where a session could vanish between two messages of the same handshake.
 */
export class McpSessionRegistry {
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  /** Looks up an existing session by its `Mcp-Session-Id` header value. */
  public get(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    return sessionId === undefined ? undefined : this.transports.get(sessionId);
  }

  /** Creates a new session's transport, connects `server` to it, and tracks it until closed. */
  public async create(server: Server): Promise<StreamableHTTPServerTransport> {
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId): void => {
        this.transports.set(sessionId, transport);
      },
      onsessionclosed: (sessionId): void => {
        this.transports.delete(sessionId);
      },
    });
    await server.connect(transport);
    return transport;
  }
}

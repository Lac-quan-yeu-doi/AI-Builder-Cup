/**
 * Narrow MCP request facade used by the MCP client. Implementations own the
 * process/network lifecycle; the client owns scope and policy. A transport
 * must never be constructed until a server profile has been selected, and
 * must be closed on abort. Implementations must never log configured headers
 * or environment values.
 */
export interface McpTransport {
  request(
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
}

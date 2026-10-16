/**
 * The API's global route prefix, applied by `app.setGlobalPrefix()` in both
 * `api-main.ts` and `openapi-export.ts`.
 *
 * Every MCP-over-HTTP controller (chart-mcp/document-mcp/trino-mcp) also
 * needs this exact value: the SSE `endpoint` event it emits tells the client
 * where to POST follow-up messages, and `setGlobalPrefix` only rewrites
 * routes the framework matches — it has no effect on that hand-built path
 * string. Without a shared constant the two drift silently: the `sse`
 * handshake succeeds (Nest's own routing already has the prefix) while every
 * subsequent `messages` POST 404s, because the client is told to POST to the
 * un-prefixed path.
 */
export const API_PREFIX = 'api/v1';

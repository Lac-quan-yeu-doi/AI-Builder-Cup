import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type RequestMeta,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

/** One MCP tool's static shape plus the handler that executes it. */
export interface McpToolHandler {
  readonly tool: Tool;
  readonly call: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export type McpToolCallRunner = (
  meta: RequestMeta | undefined,
  call: () => Promise<CallToolResult>,
  toolName: string,
) => Promise<CallToolResult>;

/**
 * Builds one MCP protocol `Server` wired to a fixed set of tools — the
 * shared shape both `mcp-chart` and `mcp-document` used to implement
 * separately in Rust (`ServerHandler::list_tools`/`call_tool`). A new
 * instance is built per SSE connection (a `Server` binds to exactly one
 * transport), so this is a factory, not a singleton.
 */
export function buildMcpToolServer(
  name: string,
  instructions: string,
  handlers: readonly McpToolHandler[],
  runToolCall: McpToolCallRunner = (_meta, call) => call(),
): Server {
  const server = new Server(
    { name, version: '1.0.0' },
    { capabilities: { tools: {} }, instructions },
  );

  const byName = new Map(handlers.map((handler) => [handler.tool.name, handler]));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validators = new Map<string, ValidateFunction>(
    handlers.map((handler) => [handler.tool.name, ajv.compile(handler.tool.inputSchema)]),
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: handlers.map((handler) => handler.tool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const handler = byName.get(request.params.name);
    if (handler === undefined) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    const args = request.params.arguments ?? {};
    const validate = validators.get(request.params.name);
    if (validate !== undefined && !validate(args)) {
      return {
        content: [
          { type: 'text', text: `Invalid tool arguments: ${formatErrors(validate.errors)}` },
        ],
        isError: true,
      };
    }
    try {
      return await runToolCall(extra._meta, () => handler.call(args), handler.tool.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  });

  return server;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const path = error.instancePath.replace(/^\//u, '').replaceAll('/', '.');
      const missing =
        error.keyword === 'required' && typeof error.params['missingProperty'] === 'string'
          ? [path, error.params['missingProperty']].filter(Boolean).join('.')
          : path;
      return `${missing || 'arguments'} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

/**
 * `McpToolCatalogEntry.input_schema` is typed as a loose `Record<string,
 * unknown>` (it's projected from `ActionDefinition.mcpTool`, shared with
 * non-MCP callers) but is always a JSON Schema object at runtime — this
 * just asserts that shape for the SDK's stricter `Tool['inputSchema']`.
 */
export function toInputSchema(schema: Record<string, unknown>): Tool['inputSchema'] {
  return schema as Tool['inputSchema'];
}

export function toolResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

import type { JsonObject } from "@domain/index.js";
import type { McpTransport } from "../transport/transport.js";
import type { McpToolDescriptor } from "./tool.js";
import { checkDataScope, type DataScope } from "./data-scope.js";

/**
 * Data scope enforced before any transport request. A request whose target
 * catalog is not in {@link McpScope.allowedCatalogs} is denied without invoking
 * the transport.
 */
export interface McpScope {
  /** Legacy manifest-level catalog allowlist. Empty means unrestricted. */
  readonly allowedCatalogs?: readonly string[];
  /** Per-run conversation scope from `data_scope`. */
  readonly dataScope?: DataScope;
}

export interface McpClientCall {
  readonly name: string;
  readonly arguments: JsonObject;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface McpCallSuccess {
  readonly success: true;
  readonly content: string;
  readonly metadata: JsonObject;
}

export interface McpCallDenied {
  readonly success: false;
  readonly code: "mcp_scope_denied" | "mcp_unknown_tool" | "mcp_tool_error";
  readonly message: string;
}

export type McpCallResult = McpCallSuccess | McpCallDenied;

export interface McpClient {
  discover(signal?: AbortSignal): Promise<readonly McpToolDescriptor[]>;
  call(call: McpClientCall, signal?: AbortSignal): Promise<McpCallResult>;
  close(): Promise<void>;
}

export interface CreateMcpClientInput {
  readonly server: string;
  readonly transport: McpTransport;
  readonly scope: McpScope;
}

const qualified = (server: string, tool: string): string => `${server}:${tool}`;

function scopeDenial(scope: McpScope, args: JsonObject): string | undefined {
  const catalog = args["catalog"];
  if (
    typeof catalog === "string" &&
    scope.allowedCatalogs !== undefined &&
    scope.allowedCatalogs.length > 0 &&
    !scope.allowedCatalogs.some(
      (allowed) => allowed.toLowerCase() === catalog.toLowerCase(),
    )
  )
    return "Requested catalog is not in this agent's catalog allowlist.";
  return scope.dataScope === undefined
    ? undefined
    : checkDataScope(scope.dataScope, args);
}

function filterSchemaDiscovery(
  content: string,
  scope: DataScope | undefined,
): string {
  if (scope === undefined) return content;
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("Schema discovery returned an invalid response.");
  }
  return JSON.stringify(
    parsed.filter((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return false;
      const item = entry as Record<string, unknown>;
      if (
        typeof item.name !== "string" ||
        item.name.trim().toLowerCase() !== scope.schema.trim().toLowerCase()
      )
        return false;
      return (
        scope.catalog === undefined ||
        (typeof item.catalog === "string" &&
          item.catalog.trim().toLowerCase() ===
            scope.catalog.trim().toLowerCase())
      );
    }),
  );
}

/**
 * Create a scope-first MCP client. Discovery qualifies every descriptor as
 * `server:tool`. A call is validated against the client's data scope before the
 * transport is touched; a denied catalog returns `mcp_scope_denied` with zero
 * transport requests.
 */
export function createMcpClient(input: CreateMcpClientInput): McpClient {
  const noSignal = (): AbortSignal => new AbortController().signal;
  return {
    async discover(signal) {
      const response = (await input.transport.request(
        "tools/list",
        {},
        signal ?? noSignal(),
      )) as { tools?: readonly McpToolDescriptor[] } | undefined;
      const tools = response?.tools ?? [];
      return tools.map((tool) => ({
        ...tool,
        name: qualified(input.server, tool.name),
      }));
    },
    async call(call, signal) {
      const [server, ...rest] = call.name.split(":");
      const localName = rest.join(":");
      if (server !== input.server || localName.length === 0) {
        return {
          success: false,
          code: "mcp_unknown_tool",
          message: "Requested tool is not served by this MCP server.",
        };
      }
      const denial = scopeDenial(input.scope, call.arguments);
      if (denial !== undefined) {
        return {
          success: false,
          code: "mcp_scope_denied",
          message: denial,
        };
      }
      const response = (await input.transport.request(
        "tools/call",
        {
          name: localName,
          arguments: call.arguments,
          ...(call.metadata === undefined ? {} : { _meta: call.metadata }),
        },
        signal ?? noSignal(),
      )) as
        | {
            isError?: boolean;
            content?: readonly { text?: string }[];
            /** MCP serializes CallToolResult.meta as the protocol `_meta` key. */
            _meta?: JsonObject;
            /** Accept transports that expose the decoded field as `meta`. */
            meta?: JsonObject;
          }
        | undefined;
      let content = (response?.content ?? [])
        .map((entry) => entry.text ?? "")
        .join("");
      if (response?.isError === true) {
        return {
          success: false,
          code: "mcp_tool_error",
          message: content || "MCP tool returned an error.",
        };
      }
      if (localName === "list_schemas" && input.scope.dataScope !== undefined) {
        try {
          content = filterSchemaDiscovery(content, input.scope.dataScope);
        } catch (error) {
          return {
            success: false,
            code: "mcp_tool_error",
            message:
              error instanceof Error
                ? error.message
                : "Schema discovery returned an invalid response.",
          };
        }
      }
      return {
        success: true,
        content,
        metadata: isJsonObject(response?._meta)
          ? response._meta
          : isJsonObject(response?.meta)
            ? response.meta
            : {},
      };
    },
    async close() {
      await input.transport.close();
    },
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

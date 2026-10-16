import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface TrinoClient {
  readonly allowedCatalogs: readonly string[];
  query(input: {
    readonly catalog: string;
    readonly sql: string;
  }): Promise<{ rows: readonly unknown[] }>;
}

const descriptor: ToolDescriptor = {
  name: "trino",
  description: "Run a read-only query against an allowlisted Trino catalog.",
  parameters: {
    type: "object",
    properties: { catalog: { type: "string" }, sql: { type: "string" } },
    required: ["catalog", "sql"],
  },
  category: "mcp",
  readOnly: true,
  destructive: false,
  aliases: [],
};

/**
 * Executable Trino tool. Queries are confined to allowlisted catalogs; a
 * disallowed catalog fails before the client is contacted.
 */
export function createTrinoTool(
  client: TrinoClient,
  policy: ToolPolicy = allowAll,
) {
  const allowed = new Set(client.allowedCatalogs);
  return executableTool(descriptor, policy, async (args) => {
    const catalog = requiredStringArgument(args, "catalog");
    if (!allowed.has(catalog))
      throw new Error(`Trino catalog is not allowlisted: ${catalog}`);
    const result = await client.query({
      catalog,
      sql: requiredStringArgument(args, "sql"),
    });
    return {
      success: true,
      content: JSON.stringify(result.rows),
      metadata: { catalog, rows: result.rows.length },
    };
  });
}

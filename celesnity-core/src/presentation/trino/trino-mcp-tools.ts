import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolResult, toolError } from '@presentation/mcp/mcp-tool-server';
import { runSqlAndCollectRows } from '@presentation/mcp/sql-execution-helper';
import type { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import {
  CatalogResponseDto,
  NamespaceResponseDto,
  TableSummaryResponseDto,
  TableMetadataResponseDto,
  ColumnProfileResponseDto,
} from '@presentation/catalog-exploration/catalog.response';

/** Everything one open trino-mcp session needs to dispatch a tool call. */
export interface TrinoMcpContext {
  readonly queryWorkbench: QueryWorkbenchUseCases;
  readonly catalogExploration: CatalogExplorationUseCases;
}

/**
 * MCP tool handlers wrapping `QueryWorkbenchUseCases`/`CatalogExplorationUseCases`
 * directly — mirrors `document-mcp-tools.ts`'s choice of calling use cases
 * directly rather than through the Actions/audit/approval framework: every
 * tool here is read-only (assertReadOnly()/DISCOVER-only calls), so nothing
 * needs auditing or approval gating beyond what CatalogAccessAuthorizer
 * already enforces inside the use cases themselves. Matches mcp-trino's
 * existing tool scope (query + browse) rather than expanding it.
 *
 * Query execution classifies authorization, parser/input and engine failures
 * separately so an agent can correct only failures that are actually
 * correctable. The discovery calls continue to use the server's shared error
 * wrapper.
 */
export function buildTrinoMcpTools(ctx: TrinoMcpContext): readonly McpToolHandler[] {
  const tools: McpToolHandler[] = [
    {
      tool: {
        name: 'run_query',
        annotations: { readOnlyHint: true },
        description:
          'Run a read-only SELECT or TABLE query against authorized base tables and return rows. ' +
          'For metadata use list_catalogs, list_schemas, list_tables, or describe_table; ' +
          'SHOW, current_catalog(), and information_schema queries are not supported here.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'The SQL query to run.' },
            catalog: {
              type: 'string',
              description: 'Catalog to query. Defaults to the configured catalog.',
            },
            schema: {
              type: 'string',
              description: 'Schema (namespace) to query within the catalog.',
            },
          },
          required: ['sql'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const sql = requireNonBlankString(args, 'sql');
        if (sql === undefined) return toolError('Missing required argument: sql');
        try {
          const { rows, warnings } = await runSqlAndCollectRows(sql, ctx.queryWorkbench, {
            catalog: optionalString(args, 'catalog'),
            namespace: optionalString(args, 'schema'),
          });
          return toolResult(JSON.stringify({ rows, warnings }, null, 2));
        } catch (error) {
          if (error instanceof CatalogAccessDeniedError) {
            return toolError(`ACCESS_DENIED: ${error.message}`);
          }
          if (error instanceof SqlExecutionError) {
            return toolError(`QUERY_REJECTED: ${error.message}`);
          }
          const message = error instanceof Error ? error.message : String(error);
          return toolError(`ENGINE_EXECUTION_FAILED: ${message}`);
        }
      },
    },
    {
      tool: {
        name: 'list_catalogs',
        annotations: { readOnlyHint: true },
        description: 'List the data catalogs visible to this agent.',
        inputSchema: toInputSchema({ type: 'object', properties: {} }),
      },
      call: async (): Promise<CallToolResult> => {
        const catalogs = await ctx.catalogExploration.listVisibleCatalogs();
        return toolResult(
          JSON.stringify(
            catalogs.map((catalog) => CatalogResponseDto.from(catalog)),
            null,
            2,
          ),
        );
      },
    },
    {
      tool: {
        name: 'list_schemas',
        annotations: { readOnlyHint: true },
        description: 'List the schemas (namespaces) within a catalog.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: { catalog: { type: 'string' } },
          required: ['catalog'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const catalog = requireString(args, 'catalog');
        if (catalog === undefined) return toolError('Missing required argument: catalog');
        const schemas = await ctx.catalogExploration.listSchemas(catalog);
        return toolResult(
          JSON.stringify(
            schemas.map((schema) => NamespaceResponseDto.from(schema)),
            null,
            2,
          ),
        );
      },
    },
    {
      tool: {
        name: 'list_tables',
        annotations: { readOnlyHint: true },
        description: 'List the tables and views within a schema.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: { catalog: { type: 'string' }, schema: { type: 'string' } },
          required: ['catalog', 'schema'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const catalog = requireString(args, 'catalog');
        if (catalog === undefined) return toolError('Missing required argument: catalog');
        const schema = requireString(args, 'schema');
        if (schema === undefined) return toolError('Missing required argument: schema');
        const tables = await ctx.catalogExploration.listTables(catalog, schema);
        return toolResult(
          JSON.stringify(
            tables.map((table) => TableSummaryResponseDto.from(table)),
            null,
            2,
          ),
        );
      },
    },
    {
      tool: {
        name: 'describe_table',
        annotations: { readOnlyHint: true },
        description: "Describe a table's columns and Trino-visible data types.",
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            catalog: { type: 'string' },
            schema: { type: 'string' },
            table: { type: 'string' },
          },
          required: ['catalog', 'schema', 'table'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const catalog = requireString(args, 'catalog');
        if (catalog === undefined) return toolError('Missing required argument: catalog');
        const schema = requireString(args, 'schema');
        if (schema === undefined) return toolError('Missing required argument: schema');
        const table = requireString(args, 'table');
        if (table === undefined) return toolError('Missing required argument: table');
        const metadata = await ctx.catalogExploration.listColumns(catalog, schema, table);
        return toolResult(JSON.stringify(TableMetadataResponseDto.from(metadata), null, 2));
      },
    },
    {
      tool: {
        name: 'profile_table',
        annotations: { readOnlyHint: true },
        description:
          "Summarize a table's columns without pulling raw rows: a compact set of distinct " +
          'values for categorical string columns, min/max/avg for numeric columns. ' +
          'Use this only when real values or ranges are needed after describe_table.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            catalog: { type: 'string' },
            schema: { type: 'string' },
            table: { type: 'string' },
            max_distinct_values: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              default: 10,
              description: 'Maximum categorical values returned per column.',
            },
          },
          required: ['catalog', 'schema', 'table'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const catalog = requireString(args, 'catalog');
        if (catalog === undefined) return toolError('Missing required argument: catalog');
        const schema = requireString(args, 'schema');
        if (schema === undefined) return toolError('Missing required argument: schema');
        const table = requireString(args, 'table');
        if (table === undefined) return toolError('Missing required argument: table');
        const maxDistinctValues = args['max_distinct_values'] ?? 10;
        if (
          typeof maxDistinctValues !== 'number' ||
          !Number.isInteger(maxDistinctValues) ||
          maxDistinctValues < 1 ||
          maxDistinctValues > 20
        ) {
          return toolError('max_distinct_values must be an integer between 1 and 20.');
        }
        const profile = await ctx.catalogExploration.profileTable(catalog, schema, table);
        return toolResult(
          JSON.stringify(
            profile.map((column) => {
              const dto = ColumnProfileResponseDto.from(column);
              return dto.topValues === undefined
                ? dto
                : { ...dto, topValues: dto.topValues.slice(0, maxDistinctValues) };
            }),
            null,
            2,
          ),
        );
      },
    },
  ];
  // This is a routing default, never an authorization grant. Discovery and
  // execution continue through the delegated user's catalog authorizer.
  for (const handler of tools) {
    const catalog = handler.tool.inputSchema.properties?.['catalog'];
    if (typeof catalog === 'object' && catalog !== null && ctx.queryWorkbench.configuredCatalog) {
      Object.assign(catalog, { default: ctx.queryWorkbench.configuredCatalog });
    }
  }
  return tools;
}

function requireString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function requireNonBlankString(args: Record<string, unknown>, key: string): string | undefined {
  const value = requireString(args, key);
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  return requireString(args, key);
}

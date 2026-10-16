import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildTrinoMcpTools } from '@presentation/trino/trino-mcp-tools';
import { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { Catalog } from '@domain/catalog-exploration/models/catalog';
import { Namespace } from '@domain/catalog-exploration/models/namespace';
import { TableSummary } from '@domain/catalog-exploration/models/table-summary';
import { TableMetadata } from '@domain/catalog-exploration/models/table-metadata';
import { ColumnProfile } from '@domain/catalog-exploration/models/column-profile';
import type { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';

function context() {
  const queryWorkbench = {
    submit: jest
      .fn()
      .mockResolvedValue({ id: 'exec-1', status: QueryStatusValue.QUEUED, warnings: [] }),
    get: jest.fn().mockResolvedValue({
      status: QueryStatusValue.SUCCEEDED,
      columns: [{ name: 'n' }],
      rows: [[1]],
    }),
  } as unknown as QueryWorkbenchUseCases;
  const catalogExploration = {
    listVisibleCatalogs: jest.fn().mockResolvedValue([Catalog.create('iceberg', 'celesnity')]),
    listSchemas: jest.fn().mockResolvedValue([Namespace.create('iceberg', 'sales')]),
    listTables: jest
      .fn()
      .mockResolvedValue([TableSummary.create('iceberg', 'sales', 'orders', 'BASE TABLE')]),
    listColumns: jest
      .fn()
      .mockResolvedValue(TableMetadata.create('iceberg', 'sales', 'orders', [])),
    profileTable: jest.fn().mockResolvedValue([
      ColumnProfile.create({
        name: 'status',
        dataType: 'varchar',
        kind: 'string',
        topValues: ['active', 'closed'],
        computedAt: '2026-09-02T00:00:00.000Z',
      }),
    ]),
  } as unknown as CatalogExplorationUseCases;
  return { queryWorkbench, catalogExploration };
}

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text')
    throw new Error('expected a text content block');
  return block.text;
}

function findTool(tools: ReturnType<typeof buildTrinoMcpTools>, name: string) {
  const found = tools.find((tool) => tool.tool.name === name);
  if (found === undefined) throw new Error(`tool ${name} not found`);
  return found;
}

describe('buildTrinoMcpTools', () => {
  it('directs metadata discovery to scoped tools instead of unsupported SQL forms', () => {
    const tool = findTool(buildTrinoMcpTools(context()), 'run_query');
    expect(tool.tool.description).toContain('list_tables');
    expect(tool.tool.description).toContain('information_schema');
  });

  it('advertises the configured catalog as a routing default without changing authorization', () => {
    const ctx = context();
    Object.defineProperty(ctx.queryWorkbench, 'configuredCatalog', { value: 'warehouse' });
    const tools = buildTrinoMcpTools(ctx);
    for (const name of ['run_query', 'list_tables', 'describe_table', 'profile_table']) {
      expect(findTool(tools, name).tool.inputSchema.properties?.['catalog']).toMatchObject({
        default: 'warehouse',
      });
    }
    expect(ctx.catalogExploration.listVisibleCatalogs).not.toHaveBeenCalled();
  });

  it('exposes exactly the six expected tools', () => {
    const tools = buildTrinoMcpTools(context());
    expect(tools.map((tool) => tool.tool.name).sort()).toEqual(
      [
        'describe_table',
        'list_catalogs',
        'list_schemas',
        'list_tables',
        'profile_table',
        'run_query',
      ].sort(),
    );
  });

  it('marks every Trino tool as read-only for downstream approval policy', () => {
    const tools = buildTrinoMcpTools(context());
    expect(tools.every((tool) => tool.tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('run_query submits sql and returns the collected rows', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const result = await findTool(tools, 'run_query').call({ sql: 'select 1' });
    expect(ctx.queryWorkbench.submit).toHaveBeenCalledWith({
      sql: 'select 1',
      catalog: undefined,
      namespace: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"n": 1');
  });

  it('run_query rejects a missing sql argument without calling submit', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const result = await findTool(tools, 'run_query').call({});
    expect(result.isError).toBe(true);
    expect(ctx.queryWorkbench.submit).not.toHaveBeenCalled();
  });

  it.each([
    [new CatalogAccessDeniedError('DEFAULT_DENY'), 'ACCESS_DENIED:'],
    [SqlExecutionError.validation('unsupported predicate'), 'QUERY_REJECTED:'],
    [new Error('Trino rejected the statement'), 'ENGINE_EXECUTION_FAILED:'],
  ])('run_query classifies %s distinctly', async (failure, expectedPrefix) => {
    const ctx = context();
    (ctx.queryWorkbench.submit as jest.Mock).mockRejectedValue(failure);
    const result = await findTool(buildTrinoMcpTools(ctx), 'run_query').call({ sql: 'select 1' });

    expect(result.isError).toBe(true);
    expect(textOf(result).startsWith(expectedPrefix)).toBe(true);
  });

  it('list_catalogs returns the visible catalogs', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const result = await findTool(tools, 'list_catalogs').call({});
    expect(ctx.catalogExploration.listVisibleCatalogs).toHaveBeenCalled();
    expect(textOf(result)).toContain('iceberg');
  });

  it('list_schemas requires a catalog argument', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const missing = await findTool(tools, 'list_schemas').call({});
    expect(missing.isError).toBe(true);
    const ok = await findTool(tools, 'list_schemas').call({ catalog: 'iceberg' });
    expect(ctx.catalogExploration.listSchemas).toHaveBeenCalledWith('iceberg');
    expect(ok.isError).toBeFalsy();
  });

  it('list_tables requires catalog and schema arguments', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const missing = await findTool(tools, 'list_tables').call({ catalog: 'iceberg' });
    expect(missing.isError).toBe(true);
    const ok = await findTool(tools, 'list_tables').call({ catalog: 'iceberg', schema: 'sales' });
    expect(ctx.catalogExploration.listTables).toHaveBeenCalledWith('iceberg', 'sales');
    expect(ok.isError).toBeFalsy();
  });

  it('describe_table requires catalog, schema, and table arguments', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const missing = await findTool(tools, 'describe_table').call({
      catalog: 'iceberg',
      schema: 'sales',
    });
    expect(missing.isError).toBe(true);
    const ok = await findTool(tools, 'describe_table').call({
      catalog: 'iceberg',
      schema: 'sales',
      table: 'orders',
    });
    expect(ctx.catalogExploration.listColumns).toHaveBeenCalledWith('iceberg', 'sales', 'orders');
    expect(ok.isError).toBeFalsy();
  });

  it('profile_table requires catalog, schema, and table arguments and returns the profile', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const missing = await findTool(tools, 'profile_table').call({
      catalog: 'iceberg',
      schema: 'sales',
    });
    expect(missing.isError).toBe(true);
    const ok = await findTool(tools, 'profile_table').call({
      catalog: 'iceberg',
      schema: 'sales',
      table: 'orders',
    });
    expect(ctx.catalogExploration.profileTable).toHaveBeenCalledWith('iceberg', 'sales', 'orders');
    expect(ok.isError).toBeFalsy();
    expect(textOf(ok)).toContain('"topValues"');
  });

  it('profile_table bounds categorical values in the MCP response', async () => {
    const ctx = context();
    const tools = buildTrinoMcpTools(ctx);
    const result = await findTool(tools, 'profile_table').call({
      catalog: 'iceberg',
      schema: 'sales',
      table: 'orders',
      max_distinct_values: 1,
    });

    expect(JSON.parse(textOf(result))[0].topValues).toHaveLength(1);
  });

  it('a denied catalog access rejects rather than being silently swallowed', async () => {
    // No local try/catch in trino-mcp-tools.ts: a rejection here must
    // propagate so buildMcpToolServer's own wrapper (mcp-tool-server.ts) is
    // what turns it into a clean isError tool result, same as chart/document
    // already rely on — this only guards against a future handler adding a
    // catch that swallows the failure into a false "success".
    const ctx = context();
    (ctx.catalogExploration.listSchemas as jest.Mock).mockRejectedValue(new Error('access denied'));
    const tools = buildTrinoMcpTools(ctx);
    await expect(findTool(tools, 'list_schemas').call({ catalog: 'iceberg' })).rejects.toThrow(
      'access denied',
    );
  });
});

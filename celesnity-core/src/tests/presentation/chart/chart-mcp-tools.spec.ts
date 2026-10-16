import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { ChartError } from '@domain/chart/errors/chart.errors';
import {
  buildChartMcpTools,
  CHAT_PREVIEW_BLOCK_MAX_BYTES,
} from '@presentation/chart/chart-mcp-tools';

const queryDefinition = {
  schemaVersion: 1 as const,
  mode: 'NATIVE' as const,
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  sql: 'SELECT region, revenue FROM orders',
};
const visualizationDefinition = {
  schemaVersion: 1 as const,
  type: 'BAR' as const,
  roles: { category: 'region', measures: ['revenue'] },
  display: {},
};
const preview = {
  runId: 'run-1',
  columns: [
    { name: 'region', type: 'varchar', family: 'STRING' as const },
    { name: 'revenue', type: 'double', family: 'NUMBER' as const },
  ],
  rows: [['west', 10]],
  rowCount: 1,
  byteCount: 20,
  truncated: false,
};

function findPreviewTool(chatCharts: Pick<ChatChartCreationUseCases, 'preview'>) {
  const tools = buildChartMcpTools({
    chatCharts: chatCharts as ChatChartCreationUseCases,
    authenticatedContexts: {
      require: () => ({
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: 'ANALYST',
      }),
    } as unknown as AuthenticatedContextStore,
  });
  const tool = tools.find(({ tool: definition }) => definition.name === 'preview_chart');
  if (!tool) throw new Error('preview_chart is missing');
  return { tools, tool };
}

function structured(result: CallToolResult): Record<string, unknown> {
  if (!result.structuredContent || Array.isArray(result.structuredContent)) {
    throw new Error('expected structured content');
  }
  return result.structuredContent;
}

describe('buildChartMcpTools', () => {
  it('exposes only a collection-free canonical preview tool', () => {
    const { tools } = findPreviewTool({ preview: jest.fn() });

    expect(tools.map(({ tool }) => tool.name)).toEqual(['preview_chart']);
    const schema = tools[0]?.tool.inputSchema as {
      readonly required?: readonly string[];
      readonly properties?: Readonly<Record<string, unknown>>;
    };
    expect(schema.required).toEqual(['title', 'query_definition', 'visualization_definition']);
    expect(schema.properties).not.toHaveProperty('organization_id');
    expect(schema.properties).not.toHaveProperty('identity_id');
    expect(schema.properties).not.toHaveProperty('collection_id');
    expect(schema.properties).toHaveProperty('run_id');
  });

  it('publishes the canonical query and visualization contracts to the agent', () => {
    const { tools } = findPreviewTool({ preview: jest.fn() });
    const schema = tools[0]?.tool.inputSchema as {
      readonly properties?: Readonly<Record<string, unknown>>;
    };
    const properties = schema.properties as Record<
      string,
      {
        readonly oneOf?: readonly Record<string, unknown>[];
      }
    >;

    const queryVariants = properties['query_definition']?.oneOf ?? [];
    const nativeQuery = queryVariants.find((variant) =>
      JSON.stringify(variant).includes('"const":"NATIVE"'),
    ) as
      | {
          readonly required?: readonly string[];
          readonly properties?: Readonly<Record<string, unknown>>;
        }
      | undefined;
    expect(nativeQuery?.required).toEqual([
      'schemaVersion',
      'mode',
      'context',
      'parameters',
      'sql',
    ]);
    expect(nativeQuery?.properties).toHaveProperty('context');
    expect(nativeQuery?.properties).toHaveProperty('parameters');
    expect(nativeQuery?.properties).toHaveProperty('sql');

    const visualizationVariants = properties['visualization_definition']?.oneOf ?? [];
    const barVisualization = visualizationVariants.find((variant) =>
      JSON.stringify(variant).includes('"const":"BAR"'),
    ) as
      | {
          readonly required?: readonly string[];
          readonly properties?: Readonly<Record<string, unknown>>;
        }
      | undefined;
    expect(visualizationVariants).toHaveLength(7);
    expect(barVisualization?.required).toEqual(['schemaVersion', 'type', 'roles', 'display']);
    expect(barVisualization?.properties?.['roles']).toMatchObject({
      type: 'object',
      required: ['category', 'measures'],
      properties: {
        category: { type: 'string' },
        measures: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
    });
  });

  it('returns a canonical preview and an exact chart message block', async () => {
    const previewChart = jest.fn().mockResolvedValue(preview);
    const { tool } = findPreviewTool({ preview: previewChart });

    const result = await tool.call({
      title: 'Revenue by region',
      description: 'A regional breakdown',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      parameter_values: {},
      run_id: 'agent-run-1',
    });

    expect(result.isError).not.toBe(true);
    expect(structured(result)).toEqual({
      kind: 'preview',
      schema_version: 1,
      title: 'Revenue by region',
      description: 'A regional breakdown',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: preview.columns,
      parameter_values: {},
      rows: preview.rows,
      run_id: 'run-1',
      row_count: 1,
      byte_count: 20,
      truncated: false,
      display_truncated: false,
    });
    expect(result._meta?.['message_block']).toEqual({
      type: 'chart',
      version: 1,
      payload: result.structuredContent,
      fallback_text: 'Revenue by region chart preview',
    });
    expect(previewChart).toHaveBeenCalledWith({
      actor: {
        organizationId: 'org-1',
        identityId: 'identity-1',
        isOrganizationAdmin: false,
      },
      title: 'Revenue by region',
      description: 'A regional breakdown',
      queryDefinition,
      visualizationDefinition,
      parameterValues: {},
    });
  });

  it('trims only display rows until the message payload fits its byte budget', async () => {
    const oversized = {
      ...preview,
      rows: Array.from({ length: 100 }, (_, index) => [index, 'x'.repeat(2_000)]),
      rowCount: 100,
      byteCount: 200_000,
    };
    const { tool } = findPreviewTool({ preview: jest.fn().mockResolvedValue(oversized) });

    const result = await tool.call({
      title: 'Large preview',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
    });
    const payload = structured(result);

    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThanOrEqual(
      CHAT_PREVIEW_BLOCK_MAX_BYTES,
    );
    expect(payload['display_truncated']).toBe(true);
    expect(payload['row_count']).toBe(100);
    expect(payload['byte_count']).toBe(200_000);
    expect((payload['rows'] as readonly unknown[]).length).toBeLessThan(100);
  });

  it('returns a safe tool error when canonical preview validation fails', async () => {
    const { tool } = findPreviewTool({
      preview: jest.fn().mockRejectedValue(ChartError.queryInvalid('Bad definition.')),
    });

    const result = await tool.call({
      title: 'Broken preview',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'QUERY_INVALID: Bad definition.' }]);
    expect(result._meta).toBeUndefined();
  });
});

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';
import type { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import type { QueryDefinition } from '@domain/chart/models/query-definition';
import type {
  OutputColumn,
  VisualizationDefinition,
} from '@domain/chart/models/visualization-definition';
import { ChartError } from '@domain/chart/errors/chart.errors';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError } from '@presentation/mcp/mcp-tool-server';

export const CHAT_PREVIEW_BLOCK_MAX_BYTES = 48 * 1024;

export interface ChartMcpContext {
  readonly chatCharts: ChatChartCreationUseCases;
  readonly authenticatedContexts: AuthenticatedContextStore;
  readonly chartPreviews?: AutomationChartPreviewStore;
}

interface ChartPreviewBlockPayloadV1 {
  readonly kind: 'preview';
  readonly schema_version: 1;
  readonly title: string;
  readonly description: string | null;
  readonly query_definition: QueryDefinition;
  readonly visualization_definition: VisualizationDefinition;
  readonly output_schema: readonly OutputColumn[];
  readonly parameter_values: Readonly<Record<string, unknown>>;
  readonly rows: readonly (readonly unknown[])[];
  readonly run_id: string;
  readonly row_count: number;
  readonly byte_count: number;
  readonly truncated: boolean;
  readonly display_truncated: boolean;
}

const identifierSchema = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' } as const;
const physicalIdentifierSchema = { type: 'string', pattern: '^[A-Za-z0-9_]+$' } as const;
const tableRefSchema = {
  type: 'object',
  properties: {
    catalog: physicalIdentifierSchema,
    schema: physicalIdentifierSchema,
    table: physicalIdentifierSchema,
  },
  required: ['catalog', 'schema', 'table'],
  additionalProperties: false,
} as const;
const queryContextSchema = {
  type: 'object',
  properties: { catalog: physicalIdentifierSchema, schema: physicalIdentifierSchema },
  required: ['catalog', 'schema'],
  additionalProperties: false,
} as const;
const queryParametersSchema = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    properties: {
      name: identifierSchema,
      type: { type: 'string', enum: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'TIMESTAMP'] },
      required: { type: 'boolean' },
    },
    required: ['name', 'type', 'required'],
    additionalProperties: false,
  },
} as const;

/**
 * Expressions are recursive, but keeping their complete discriminated shape
 * inline makes the MCP contract useful to models and portable across providers
 * that do not resolve JSON Schema references.
 */
const expressionSchema = {
  type: 'object',
  description:
    'Canonical expression. FIELD uses relation and field; LITERAL uses valueType and value; BINARY uses operator, left and right; UNARY uses operator and operand; CALL uses function and arguments; CASE uses branches and otherwise.',
  properties: {
    kind: { type: 'string', enum: ['FIELD', 'LITERAL', 'BINARY', 'UNARY', 'CALL', 'CASE'] },
    relation: identifierSchema,
    field: physicalIdentifierSchema,
    valueType: { type: 'string', enum: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'NULL'] },
    value: { type: ['string', 'number', 'boolean', 'null'] },
    operator: {
      type: 'string',
      enum: [
        'ADD',
        'SUBTRACT',
        'MULTIPLY',
        'DIVIDE',
        'EQ',
        'NOT_EQ',
        'GT',
        'GTE',
        'LT',
        'LTE',
        'AND',
        'OR',
        'NOT',
        'NEGATE',
      ],
    },
    left: { type: 'object' },
    right: { type: 'object' },
    operand: { type: 'object' },
    function: identifierSchema,
    arguments: { type: 'array', items: { type: 'object' }, maxItems: 100 },
    branches: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: { when: { type: 'object' }, then: { type: 'object' } },
        required: ['when', 'then'],
      },
    },
    otherwise: { type: 'object' },
  },
  required: ['kind'],
} as const;
const namedExpressionSchema = {
  type: 'object',
  properties: { alias: identifierSchema, expression: expressionSchema },
  required: ['alias', 'expression'],
  additionalProperties: false,
} as const;

const nativeQuerySchema = {
  type: 'object',
  description: 'Canonical native SQL query definition.',
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'NATIVE' },
    context: queryContextSchema,
    parameters: queryParametersSchema,
    sql: { type: 'string', minLength: 1 },
  },
  required: ['schemaVersion', 'mode', 'context', 'parameters', 'sql'],
  additionalProperties: false,
} as const;
const visualQuerySchema = {
  type: 'object',
  description: 'Canonical visual-builder query definition.',
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'VISUAL' },
    context: queryContextSchema,
    parameters: queryParametersSchema,
    source: {
      type: 'object',
      properties: { table: tableRefSchema, alias: identifierSchema },
      required: ['table', 'alias'],
      additionalProperties: false,
    },
    joins: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['INNER', 'LEFT', 'RIGHT', 'FULL'] },
          table: tableRefSchema,
          alias: identifierSchema,
          conditions: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                left: expressionSchema,
                operator: { type: 'string', enum: ['EQ', 'NOT_EQ', 'GT', 'GTE', 'LT', 'LTE'] },
                right: expressionSchema,
              },
              required: ['left', 'operator', 'right'],
              additionalProperties: false,
            },
          },
        },
        required: ['type', 'table', 'alias', 'conditions'],
        additionalProperties: false,
      },
    },
    projections: { type: 'array', items: namedExpressionSchema, maxItems: 100 },
    customExpressions: { type: 'array', items: namedExpressionSchema, maxItems: 100 },
    filters: { type: 'array', items: expressionSchema, maxItems: 100 },
    aggregations: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          alias: identifierSchema,
          expression: expressionSchema,
          function: identifierSchema,
        },
        required: ['alias', 'expression', 'function'],
        additionalProperties: false,
      },
    },
    breakouts: { type: 'array', items: expressionSchema, maxItems: 100 },
    postAggregationFilters: { type: 'array', items: expressionSchema, maxItems: 100 },
    orderBy: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          expression: expressionSchema,
          direction: { type: 'string', enum: ['ASC', 'DESC'] },
        },
        required: ['expression', 'direction'],
        additionalProperties: false,
      },
    },
    limit: { type: 'integer', minimum: 1, maximum: 10_000 },
  },
  required: [
    'schemaVersion',
    'mode',
    'context',
    'parameters',
    'source',
    'joins',
    'projections',
    'customExpressions',
    'filters',
    'aggregations',
    'breakouts',
    'postAggregationFilters',
    'orderBy',
  ],
  additionalProperties: false,
} as const;

const stringRoleSchema = { type: 'string', minLength: 1 } as const;
const measuresRoleSchema = {
  type: 'array',
  items: stringRoleSchema,
  minItems: 1,
  uniqueItems: true,
} as const;
const displaySchema = {
  type: 'object',
  description:
    'Optional display settings for the selected visualization type. Omit unsupported settings.',
  properties: {
    orientation: { type: 'string', enum: ['VERTICAL', 'HORIZONTAL'] },
    stacking: { type: 'string', enum: ['NONE', 'STACKED', 'PERCENT'] },
    showLegend: { type: 'boolean' },
    showLabels: { type: 'boolean' },
    showTitle: { type: 'boolean' },
    showValue: { type: 'boolean' },
    gridlines: { type: 'boolean' },
    interpolation: { type: 'string', enum: ['LINEAR', 'STEP', 'SMOOTH'] },
    markers: { type: 'boolean' },
    lineStyle: { type: 'string', enum: ['SOLID', 'DASHED', 'DOTTED'] },
    missingValueHandling: { type: 'string', enum: ['LINE', 'ZERO', 'GAP'] },
    variant: { type: 'string', enum: ['PIE', 'DONUT'] },
    showTotal: { type: 'boolean' },
    percentagePlacement: { type: 'string', enum: ['OFF', 'IN_LEGEND', 'ON_CHART', 'BOTH'] },
    decimalPlaces: { type: 'integer', minimum: 0, maximum: 10 },
    minimumSlicePercentage: { type: 'number', minimum: 0, maximum: 100 },
    donutRadius: { type: 'number', minimum: 0, maximum: 1 },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    pointSize: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

function visualizationSchema(
  type: VisualizationDefinition['type'],
  roleProperties: Record<string, unknown>,
  requiredRoles: readonly string[],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      schemaVersion: { type: 'integer', const: 1 },
      type: { type: 'string', const: type },
      roles: {
        type: 'object',
        properties: roleProperties,
        required: requiredRoles,
        additionalProperties: false,
      },
      display: displaySchema,
    },
    required: ['schemaVersion', 'type', 'roles', 'display'],
    additionalProperties: false,
  };
}

const queryDefinitionSchema = { oneOf: [nativeQuerySchema, visualQuerySchema] } as const;
const visualizationDefinitionSchema = {
  oneOf: [
    visualizationSchema('TABLE', { columns: measuresRoleSchema }, ['columns']),
    visualizationSchema('NUMBER', { measure: stringRoleSchema }, ['measure']),
    visualizationSchema(
      'BAR',
      { category: stringRoleSchema, measures: measuresRoleSchema, breakout: stringRoleSchema },
      ['category', 'measures'],
    ),
    visualizationSchema(
      'LINE',
      { x: stringRoleSchema, measures: measuresRoleSchema, series: stringRoleSchema },
      ['x', 'measures'],
    ),
    visualizationSchema(
      'AREA',
      { x: stringRoleSchema, measures: measuresRoleSchema, series: stringRoleSchema },
      ['x', 'measures'],
    ),
    visualizationSchema('PIE', { measure: stringRoleSchema, breakout: stringRoleSchema }, [
      'measure',
      'breakout',
    ]),
    visualizationSchema(
      'SCATTER',
      {
        x: stringRoleSchema,
        y: stringRoleSchema,
        series: stringRoleSchema,
        size: stringRoleSchema,
      },
      ['x', 'y'],
    ),
  ],
} as const;

export function buildChartMcpTools(context: ChartMcpContext): readonly McpToolHandler[] {
  return [
    {
      tool: {
        name: 'preview_chart',
        description:
          'Validate and execute a bounded transient chart preview from canonical query and visualization definitions. This never saves a chart.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: ['string', 'null'], maxLength: 2_000 },
            query_definition: queryDefinitionSchema,
            visualization_definition: visualizationDefinitionSchema,
            parameter_values: { type: 'object' },
            run_id: {
              type: 'string',
              description: 'Runtime-injected trace identifier; never used for authorization.',
            },
          },
          required: ['title', 'query_definition', 'visualization_definition'],
          additionalProperties: false,
        }),
      },
      call: (args) => previewChart(args, context),
    },
  ];
}

async function previewChart(
  args: Record<string, unknown>,
  context: ChartMcpContext,
): Promise<CallToolResult> {
  const title = nonBlankString(args['title']);
  if (!title) return toolError('Missing required argument: title');
  if (title.length > 200) return toolError('Chart title exceeds 200 characters.');

  const description = optionalNullableString(args['description']);
  if (description === undefined) return toolError('Description must be a string or null.');
  if (description !== null && description.length > 2_000) {
    return toolError('Chart description exceeds 2000 characters.');
  }
  if (!isPlainObject(args['query_definition'])) {
    return toolError('Missing required argument: query_definition');
  }
  if (!isPlainObject(args['visualization_definition'])) {
    return toolError('Missing required argument: visualization_definition');
  }
  if (args['parameter_values'] !== undefined && !isPlainObject(args['parameter_values'])) {
    return toolError('Parameter values must be an object.');
  }

  const principal = context.authenticatedContexts.require();
  const queryDefinition = args['query_definition'] as unknown as QueryDefinition;
  const visualizationDefinition = args[
    'visualization_definition'
  ] as unknown as VisualizationDefinition;
  const parameterValues = (args['parameter_values'] ?? {}) as Readonly<Record<string, unknown>>;

  try {
    const preview = await context.chatCharts.preview({
      actor: {
        organizationId: principal.organizationId,
        identityId: principal.identityId,
        isOrganizationAdmin: ['PLATFORM_ADMIN', 'ORG_OWNER', 'ORG_ADMIN'].includes(principal.role),
      },
      title,
      description,
      queryDefinition,
      visualizationDefinition,
      parameterValues,
    });
    const payload = fitPayload({
      kind: 'preview',
      schema_version: 1,
      title,
      description,
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: preview.columns,
      parameter_values: parameterValues,
      rows: preview.rows,
      run_id: preview.runId,
      row_count: preview.rowCount,
      byte_count: preview.byteCount,
      truncated: preview.truncated,
      display_truncated: false,
    });
    context.chartPreviews?.remember(
      principal.automationRunId,
      payload as unknown as Readonly<Record<string, unknown>>,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      structuredContent: payload as unknown as Record<string, unknown>,
      _meta: {
        message_block: {
          type: 'chart',
          version: 1,
          payload,
          fallback_text: `${title} chart preview`,
        },
      },
    };
  } catch (error: unknown) {
    return toolError(error instanceof ChartError ? error.message : 'Chart preview failed.');
  }
}

function fitPayload(payload: ChartPreviewBlockPayloadV1): ChartPreviewBlockPayloadV1 {
  let rows = [...payload.rows];
  while (
    payloadBytes({ ...payload, rows, display_truncated: rows.length < payload.rows.length }) >
      CHAT_PREVIEW_BLOCK_MAX_BYTES &&
    rows.length > 0
  ) {
    rows = rows.slice(0, -1);
  }
  const fitted = {
    ...payload,
    rows,
    display_truncated: rows.length < payload.rows.length,
  };
  if (payloadBytes(fitted) > CHAT_PREVIEW_BLOCK_MAX_BYTES) {
    throw new Error('Chart preview payload exceeds its transport budget.');
  }
  return fitted;
}

function payloadBytes(payload: ChartPreviewBlockPayloadV1): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

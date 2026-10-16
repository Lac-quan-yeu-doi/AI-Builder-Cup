import type { McpToolCatalogEntry } from '@application/actions/mcp-catalog';

/**
 * The public Chat-to-Chart contract. Persistence details (collection,
 * ownership, preview proof and output rows) are deliberately absent: Core
 * derives them from the authenticated actor and the bounded query execution.
 */
const properties = {
  title: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', maxLength: 2_000 },
  query_definition: { type: 'object', additionalProperties: true },
  visualization_definition: { type: 'object', additionalProperties: true },
  parameter_values: { type: 'object', additionalProperties: true },
  chart_id: { type: 'string' },
  expected_revision: { type: 'integer', minimum: 1 },
  collection_id: { type: 'string' },
  rationale: { type: 'string', maxLength: 2_000 },
  run_id: {
    type: 'string',
    description: 'Auto-attached by the agent runtime for tracing; do not set manually.',
  },
};

const entry = (
  toolName: string,
  actionName: string,
  description: string,
  required: readonly string[] = [],
  approvalRequired = false,
  allowedProperties: readonly (keyof typeof properties)[] = Object.keys(
    properties,
  ) as (keyof typeof properties)[],
): McpToolCatalogEntry => ({
  tool_name: toolName,
  action_name: actionName,
  description,
  input_schema: {
    type: 'object',
    properties: Object.fromEntries(allowedProperties.map((key) => [key, properties[key]])),
    required,
    additionalProperties: false,
  },
  permission: toolName === 'get_chart' || toolName === 'list_charts' ? 'read' : 'write',
  audit_required: true,
  approval_required: approvalRequired,
});

export const CANONICAL_CHART_MCP_CATALOG: readonly McpToolCatalogEntry[] = [
  entry(
    'create_chart',
    'chart.create',
    'Create a chart after Core executes and validates the complete query and visualization definition. Core places it in the initiating user Personal Collection. Never send result rows, vl_spec, collection_id or preview proof.',
    ['title', 'query_definition', 'visualization_definition'],
    false,
    [
      'title',
      'description',
      'query_definition',
      'visualization_definition',
      'parameter_values',
      'run_id',
    ],
  ),
  entry(
    'update_chart',
    'chart.update',
    'Run and validate a complete replacement definition, then create one new chart revision. Never send result rows, vl_spec, collection_id or preview proof.',
    ['chart_id', 'title', 'query_definition', 'visualization_definition', 'expected_revision'],
    false,
    [
      'chart_id',
      'title',
      'description',
      'query_definition',
      'visualization_definition',
      'parameter_values',
      'expected_revision',
      'run_id',
    ],
  ),
  entry(
    'get_chart',
    'chart.get',
    'Get a canonical chart definition and current revision.',
    ['chart_id'],
    false,
    ['chart_id', 'run_id'],
  ),
  entry(
    'list_charts',
    'chart.list',
    'List canonical chart summaries visible to the caller.',
    [],
    false,
    ['run_id'],
  ),
  entry(
    'move_chart',
    'chart.move',
    'Move a chart to a collection where the caller has Curate access.',
    ['chart_id', 'collection_id'],
    false,
    ['chart_id', 'collection_id', 'run_id'],
  ),
  entry(
    'remove_chart',
    'chart.remove',
    'Propose archiving a chart. A human approval is required before the archive is applied.',
    ['chart_id', 'rationale'],
    true,
    ['chart_id', 'rationale', 'run_id'],
  ),
];

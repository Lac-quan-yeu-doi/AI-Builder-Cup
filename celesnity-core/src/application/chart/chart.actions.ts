import type { ActionDefinition } from '@application/actions/action.types';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import type { Chart } from '@domain/chart/models/chart';
import type { ChartAuthoringUseCases } from './chart-authoring.use-cases';

export const CHART_ACTIONS = Symbol('ChartActions');
import type {
  ChartUseCases,
  CreateChartInput,
  PatchChartInput,
  UpdateChartDataInput,
  UpdateChartEncodingsInput,
  UpdateChartSpecInput,
} from './chart.use-cases';

export interface ChartActions {
  readonly create: ActionDefinition<CreateChartInput, Chart>;
  readonly setData: ActionDefinition<{ chartId: string } & UpdateChartDataInput, Chart>;
  readonly setEncodings: ActionDefinition<{ chartId: string } & UpdateChartEncodingsInput, Chart>;
  readonly setSpec: ActionDefinition<{ chartId: string } & UpdateChartSpecInput, Chart>;
  readonly patch: ActionDefinition<{ chartId: string } & PatchChartInput, Chart>;
  readonly delete: ActionDefinition<{ chartId: string; expectedVersion?: number }, void>;
  readonly findById: ActionDefinition<{ chartId: string }, Chart>;
  readonly list: ActionDefinition<{ cursor?: string; limit?: number }, readonly Chart[]>;
  /** Internal canonical archive action, resolved by PendingActionUseCases. */
  readonly canonicalRemove?: ActionDefinition<CanonicalRemoveInput, Chart>;
}

export interface CanonicalRemoveInput {
  readonly organizationId: string;
  readonly chartId: string;
}

const CHART_TYPE_ENUM = ['bar', 'line', 'area', 'point', 'pie', 'scatter'];

const RUN_ID_PROPERTY = {
  type: 'string',
  description:
    'Auto-attached by the agent runtime to trace this call back to a run. Do not set manually.',
};

const SQL_PROPERTY = {
  type: 'string',
  description:
    'The exact final read-only query whose result rows produced the chart. It must query at ' +
    'least one authorized business-data table. Do not use catalog metadata namespaces such as ' +
    'information_schema/system or relation-less synthetic queries such as VALUES.',
};

const ENCODING_CHANNEL_WITH_AGGREGATE_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    type: { type: 'string', enum: ['quantitative', 'nominal', 'ordinal', 'temporal'] },
    aggregate: { type: 'string' },
    title: { type: 'string' },
  },
  required: ['field', 'type'],
};

const ENCODING_CHANNEL_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    type: { type: 'string', enum: ['quantitative', 'nominal', 'ordinal', 'temporal'] },
    title: { type: 'string' },
  },
  required: ['field', 'type'],
};

const ENCODINGS_SCHEMA = {
  type: 'object',
  description:
    'Encoding map with optional keys: x, y, color, size. Each value has: field (string), ' +
    'type (quantitative|nominal|ordinal|temporal), optional aggregate and title.',
  properties: {
    x: ENCODING_CHANNEL_WITH_AGGREGATE_SCHEMA,
    y: ENCODING_CHANNEL_WITH_AGGREGATE_SCHEMA,
    color: ENCODING_CHANNEL_SCHEMA,
    size: ENCODING_CHANNEL_SCHEMA,
  },
};

/**
 * Declares every chart action's metadata once, wrapping `ChartUseCases`.
 * Every write is `auditRequired`. `chart.delete` is `approvalRequired` —
 * charts are global (shared, everyone-sees-it) since 2026-08-23, so an
 * agent deleting one is the one destructive, hard-to-reverse action in this
 * set and goes through the Checkpoint flow (`PendingActionUseCases`)
 * instead of running immediately. Every other action stays immediate,
 * matching "create charts automatically, don't ask permission."
 *
 * `mcpTool` on each write action (plus `delete`) is the single source of
 * truth `mcp-chart` fetches at startup — see `GET /chart-actions/mcp-tools`
 * (`chart-actions-catalog.controller.ts`) and
 * `application/actions/mcp-catalog.ts`. Read actions (`findById`, `list`)
 * have no `mcpTool`: not everything a domain can do needs to be
 * agent-callable.
 */
function resolved(
  name: string,
  field: 'approvalRequired' | 'auditRequired',
  codeDefault: boolean,
  policy: ActionPolicyOverrides,
): boolean {
  return policy[name]?.[field] ?? codeDefault;
}

function isChartAuthoringUseCases(
  value: ChartAuthoringUseCases | ActionPolicyOverrides | undefined,
): value is ChartAuthoringUseCases {
  return typeof (value as ChartAuthoringUseCases | undefined)?.archiveChart === 'function';
}

export function buildChartActions(
  useCases: ChartUseCases,
  policy?: ActionPolicyOverrides,
): ChartActions;
export function buildChartActions(
  useCases: ChartUseCases,
  canonicalAuthoring?: ChartAuthoringUseCases,
  policy?: ActionPolicyOverrides,
): ChartActions;
export function buildChartActions(
  useCases: ChartUseCases,
  canonicalOrPolicy?: ChartAuthoringUseCases | ActionPolicyOverrides,
  policyOverrides: ActionPolicyOverrides = {},
): ChartActions {
  const canonicalAuthoring = isChartAuthoringUseCases(canonicalOrPolicy)
    ? canonicalOrPolicy
    : undefined;
  const policy = canonicalAuthoring
    ? policyOverrides
    : ((canonicalOrPolicy as ActionPolicyOverrides | undefined) ?? {});
  const actions: ChartActions = {
    create: {
      name: 'chart.create',
      permission: 'write',
      auditRequired: resolved('chart.create', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.create', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'create_chart',
        description:
          'Create a new chart and run its SQL. Pass encodings in this same call whenever you ' +
          'already know the field mappings — the chart is immediately renderable that way. ' +
          'Only chart a successful query over authorized business-data tables; catalog inventory ' +
          'and synthetic rows are not chart data. ' +
          'If you omit encodings, the chart is created as an empty draft and you MUST call ' +
          'set_chart_encodings next, in the same turn, or the user sees a blank chart.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Chart title displayed to the user' },
            chart_type: {
              type: 'string',
              enum: CHART_TYPE_ENUM,
              description: 'The type of chart to render',
            },
            sql: SQL_PROPERTY,
            encodings: ENCODINGS_SCHEMA,
            run_id: RUN_ID_PROPERTY,
          },
          required: ['title', 'chart_type', 'sql'],
        },
      },
      run: (input) => useCases.create(input),
    },
    setData: {
      name: 'chart.setData',
      permission: 'write',
      auditRequired: resolved('chart.setData', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.setData', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'set_chart_data',
        description:
          'Run SQL and push its result rows into an existing chart. The chart spec will be ' +
          'automatically reassembled with the query result.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID returned by create_chart' },
            sql: SQL_PROPERTY,
            run_id: RUN_ID_PROPERTY,
          },
          required: ['chart_id', 'sql'],
        },
      },
      run: ({ chartId, ...input }) => useCases.setData(chartId, input),
    },
    setEncodings: {
      name: 'chart.setEncodings',
      permission: 'write',
      auditRequired: resolved('chart.setEncodings', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.setEncodings', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'set_chart_encodings',
        description:
          'Set the visual encodings (field mappings) for a chart. This tells the chart ' +
          'which data fields to use for x-axis, y-axis, color, etc. The spec is ' +
          'automatically reassembled.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID returned by create_chart' },
            encodings: ENCODINGS_SCHEMA,
            run_id: RUN_ID_PROPERTY,
          },
          required: ['chart_id', 'encodings'],
        },
      },
      run: ({ chartId, ...input }) => useCases.setEncodings(chartId, input),
    },
    setSpec: {
      name: 'chart.setSpec',
      permission: 'write',
      auditRequired: resolved('chart.setSpec', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.setSpec', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'set_chart_spec',
        description:
          "Directly set a chart's Vega-Lite spec, bypassing encoding/data assembly. Use " +
          'when the encodings/data tools cannot express what you need.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID returned by create_chart' },
            vl_spec: {
              type: 'object',
              description: 'A complete Vega-Lite v5 specification (without a data block).',
            },
            expected_version: {
              type: 'integer',
              description: 'Optimistic-concurrency version check. Omit to skip the check.',
            },
            run_id: RUN_ID_PROPERTY,
          },
          required: ['chart_id', 'vl_spec'],
        },
      },
      run: ({ chartId, ...input }) => useCases.setSpec(chartId, input),
    },
    patch: {
      name: 'chart.patch',
      permission: 'write',
      auditRequired: resolved('chart.patch', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.patch', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'patch_chart',
        description:
          'Update one or more chart fields at once (title, chart_type, encodings, config, ' +
          'or vl_spec). Data must be loaded through set_chart_data using SQL.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID returned by create_chart' },
            title: { type: 'string' },
            chart_type: { type: 'string', enum: CHART_TYPE_ENUM },
            encodings: ENCODINGS_SCHEMA,
            config: { type: 'object' },
            vl_spec: { type: 'object' },
            sql: SQL_PROPERTY,
            expected_version: {
              type: 'integer',
              description: 'Optimistic-concurrency version check. Omit to skip the check.',
            },
            run_id: RUN_ID_PROPERTY,
          },
          required: ['chart_id'],
        },
      },
      run: ({ chartId, ...input }) => useCases.patch(chartId, input),
    },
    delete: {
      name: 'chart.delete',
      permission: 'write',
      auditRequired: resolved('chart.delete', 'auditRequired', true, policy),
      approvalRequired: resolved('chart.delete', 'approvalRequired', true, policy),
      mcpTool: {
        name: 'remove_chart',
        description:
          'Propose deleting a chart. Charts are global, so deletion requires human ' +
          'approval — this returns a pending-action id rather than deleting immediately.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID to delete' },
            expected_version: {
              type: 'integer',
              description: 'Optimistic-concurrency version check. Omit to skip the check.',
            },
            rationale: {
              type: 'string',
              description:
                'Why you are proposing this deletion — shown to the human who approves or rejects it.',
            },
            run_id: RUN_ID_PROPERTY,
          },
          required: ['chart_id'],
        },
      },
      run: ({ chartId, expectedVersion }) => useCases.delete(chartId, expectedVersion),
    },
    findById: {
      name: 'chart.findById',
      permission: 'read',
      auditRequired: resolved('chart.findById', 'auditRequired', false, policy),
      approvalRequired: resolved('chart.findById', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'get_chart',
        description:
          'Get a single chart by its ID. Returns the full chart object including title, ' +
          'chart_type, encodings, data, vl_spec, status, and version.',
        inputSchema: {
          type: 'object',
          properties: {
            chart_id: { type: 'string', description: 'The chart ID to retrieve' },
          },
          required: ['chart_id'],
        },
      },
      run: ({ chartId }) => useCases.findById(chartId),
    },
    list: {
      name: 'chart.list',
      permission: 'read',
      auditRequired: resolved('chart.list', 'auditRequired', false, policy),
      approvalRequired: resolved('chart.list', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'list_charts',
        description:
          'List all charts. Returns an array of chart objects with id, title, chart_type, ' +
          'status, version, created_at, and updated_at. Use this to find a chart by name ' +
          'before updating or deleting it.',
        inputSchema: {
          type: 'object',
          properties: {
            cursor: {
              type: 'string',
              description: 'Pagination cursor from a previous response. Omit for the first page.',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of charts to return (default 50).',
            },
          },
        },
      },
      run: ({ cursor, limit }) => useCases.list(cursor, limit),
    },
  };
  if (canonicalAuthoring) {
    return {
      ...actions,
      canonicalRemove: {
        name: 'chart.remove',
        permission: 'write',
        auditRequired: resolved('chart.remove', 'auditRequired', true, policy),
        approvalRequired: resolved('chart.remove', 'approvalRequired', true, policy),
        run: async (input, actor): Promise<Chart> => {
          if (!actor.identityId) {
            throw new Error('A user identity is required to archive a canonical chart.');
          }
          return canonicalAuthoring.archiveChart({
            actor: {
              organizationId: input.organizationId,
              identityId: actor.identityId,
              isOrganizationAdmin: false,
            },
            chartId: input.chartId,
          });
        },
      },
    };
  }
  return actions;
}

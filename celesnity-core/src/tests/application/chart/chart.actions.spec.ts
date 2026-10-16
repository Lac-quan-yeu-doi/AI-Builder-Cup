import { buildChartActions } from '@application/chart/chart.actions';
import { buildMcpCatalog } from '@application/actions/mcp-catalog';
import type { ActionDefinition } from '@application/actions/action.types';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import type { ChartUseCases } from '@application/chart/chart.use-cases';
import { CANONICAL_CHART_MCP_CATALOG } from '@application/chart/canonical-chart-action.catalog';

describe('buildChartActions MCP catalog', () => {
  it('publishes exactly six canonical Chat-to-Chart operations without row/spec inputs', () => {
    expect(CANONICAL_CHART_MCP_CATALOG.map((entry) => entry.tool_name)).toEqual([
      'create_chart',
      'update_chart',
      'get_chart',
      'list_charts',
      'move_chart',
      'remove_chart',
    ]);
    for (const entry of CANONICAL_CHART_MCP_CATALOG) {
      const properties = (entry.input_schema.properties ?? {}) as Record<string, unknown>;
      expect(properties).not.toHaveProperty('data');
      expect(properties).not.toHaveProperty('vl_spec');
      expect(properties).not.toHaveProperty('preview_token');
      expect(properties).not.toHaveProperty('output_schema');
      expect(properties).not.toHaveProperty('owner_identity_id');
    }
    const createProperties = CANONICAL_CHART_MCP_CATALOG.find(
      (entry) => entry.tool_name === 'create_chart',
    )?.input_schema.properties as Record<string, unknown>;
    expect(createProperties).not.toHaveProperty('collection_id');
    expect(createProperties).not.toHaveProperty('output_schema');
    expect(
      CANONICAL_CHART_MCP_CATALOG.find((entry) => entry.tool_name === 'remove_chart'),
    ).toMatchObject({ approval_required: true });
  });

  it('declares auto-attached run_id on move and remove without requiring model input', () => {
    for (const toolName of ['move_chart', 'remove_chart']) {
      const schema = CANONICAL_CHART_MCP_CATALOG.find((entry) => entry.tool_name === toolName)
        ?.input_schema as {
        properties?: Record<string, unknown>;
        required?: readonly string[];
      };

      expect(schema.properties).toHaveProperty('run_id');
      expect(schema.required).not.toContain('run_id');
    }
  });

  it('exposes exactly the eight chart actions mcp-chart depends on, by name', () => {
    const actions = buildChartActions({} as ChartUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );
    const toolNames = catalog.map((entry) => entry.tool_name).sort();

    expect(toolNames).toEqual(
      [
        'create_chart',
        'get_chart',
        'list_charts',
        'set_chart_data',
        'set_chart_encodings',
        'set_chart_spec',
        'patch_chart',
        'remove_chart',
      ].sort(),
    );
  });

  it('exposes read-only actions as MCP tools for chart discovery', () => {
    const actions = buildChartActions({} as ChartUseCases);

    expect(actions.findById.mcpTool).toBeDefined();
    expect(actions.findById.mcpTool!.name).toBe('get_chart');
    expect(actions.list.mcpTool).toBeDefined();
    expect(actions.list.mcpTool!.name).toBe('list_charts');
  });

  it('every exposed tool schema requires chart_id except create_chart', () => {
    const actions = buildChartActions({} as ChartUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );

    for (const entry of catalog) {
      const required = (entry.input_schema as { required?: string[] }).required ?? [];
      if (entry.tool_name === 'create_chart') {
        expect(required).toEqual(expect.arrayContaining(['title', 'chart_type']));
        expect(required).toContain('sql');
      } else if (entry.tool_name !== 'list_charts') {
        expect(required).toContain('chart_id');
      }
    }
  });

  it('exposes SQL instead of data for agent chart updates', () => {
    const actions = buildChartActions({} as ChartUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );
    const setData = catalog.find((entry) => entry.tool_name === 'set_chart_data');
    const patch = catalog.find((entry) => entry.tool_name === 'patch_chart');

    expect(setData?.input_schema).toMatchObject({
      required: ['chart_id', 'sql'],
    });
    expect(setData?.input_schema.properties).not.toHaveProperty('data');
    expect(patch?.input_schema.properties).not.toHaveProperty('data');
  });

  it('applies a policy override for approvalRequired, leaving other actions at their code default', () => {
    const policy: ActionPolicyOverrides = { 'chart.create': { approvalRequired: true } };
    const actions = buildChartActions({} as ChartUseCases, policy);

    expect(actions.create.approvalRequired).toBe(true);
    expect(actions.delete.approvalRequired).toBe(true); // unchanged code default
    expect(actions.setData.approvalRequired).toBe(false); // unchanged code default
  });

  it('applies a policy override for auditRequired', () => {
    const policy: ActionPolicyOverrides = { 'chart.findById': { auditRequired: true } };
    const actions = buildChartActions({} as ChartUseCases, policy);

    expect(actions.findById.auditRequired).toBe(true);
  });

  it('uses code defaults when no policy is supplied', () => {
    const actions = buildChartActions({} as ChartUseCases);

    expect(actions.delete.approvalRequired).toBe(true);
    expect(actions.create.approvalRequired).toBe(false);
  });
});

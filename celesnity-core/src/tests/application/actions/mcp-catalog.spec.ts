import type { ActionDefinition } from '@application/actions/action.types';
import { buildMcpCatalog } from '@application/actions/mcp-catalog';

function action(
  name: string,
  overrides: Partial<ActionDefinition<unknown, unknown>> = {},
): ActionDefinition<unknown, unknown> {
  return {
    name,
    permission: 'write',
    auditRequired: false,
    approvalRequired: false,
    run: (): Promise<unknown> => Promise.resolve(undefined),
    ...overrides,
  };
}

describe('buildMcpCatalog', () => {
  it('includes only actions that declare an mcpTool', () => {
    const actions = {
      exposed: action('domain.exposed', {
        mcpTool: {
          name: 'do_thing',
          description: 'Does a thing.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      }),
      internal: action('domain.internal'),
    };

    const catalog = buildMcpCatalog(actions);

    expect(catalog).toEqual([
      {
        tool_name: 'do_thing',
        action_name: 'domain.exposed',
        description: 'Does a thing.',
        input_schema: { type: 'object', properties: {}, required: [] },
        permission: 'write',
        audit_required: false,
        approval_required: false,
      },
    ]);
  });

  it('returns an empty catalog when no action declares an mcpTool', () => {
    const actions = { internal: action('domain.internal') };

    expect(buildMcpCatalog(actions)).toEqual([]);
  });

  it('surfaces permission/audit_required/approval_required so a management view can tell which tools need approval', () => {
    const actions = {
      gated: action('domain.gated', {
        permission: 'write',
        auditRequired: true,
        approvalRequired: true,
        mcpTool: {
          name: 'gated_tool',
          description: 'Requires approval.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      }),
    };

    const catalog = buildMcpCatalog(actions);

    expect(catalog).toEqual([
      {
        tool_name: 'gated_tool',
        action_name: 'domain.gated',
        description: 'Requires approval.',
        input_schema: { type: 'object', properties: {}, required: [] },
        permission: 'write',
        audit_required: true,
        approval_required: true,
      },
    ]);
  });

  function withMcpTool(
    name: string,
    permission: 'read' | 'write',
  ): ActionDefinition<unknown, unknown> {
    return action(name, {
      permission,
      mcpTool: {
        name: `${name}_tool`,
        description: 'desc',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  it('filters by permission when a filter is supplied', () => {
    const actions = {
      reader: withMcpTool('domain.read', 'read'),
      writer: withMcpTool('domain.write', 'write'),
    };

    const catalog = buildMcpCatalog(actions, {}, { permissions: ['read'] });

    expect(catalog.map((entry) => entry.action_name)).toEqual(['domain.read']);
  });

  it('filters by action name when a filter is supplied', () => {
    const actions = {
      a: withMcpTool('domain.a', 'write'),
      b: withMcpTool('domain.b', 'write'),
    };

    const catalog = buildMcpCatalog(actions, {}, { actionNames: ['domain.b'] });

    expect(catalog.map((entry) => entry.action_name)).toEqual(['domain.b']);
  });

  it('composes permission and action-name filters with AND', () => {
    const actions = {
      a: withMcpTool('domain.a', 'read'),
      b: withMcpTool('domain.b', 'write'),
    };

    const catalog = buildMcpCatalog(
      actions,
      {},
      { permissions: ['read'], actionNames: ['domain.b'] },
    );

    expect(catalog).toEqual([]);
  });

  it('imposes no restriction when the filter object is absent entirely', () => {
    const actions = { a: withMcpTool('domain.a', 'read'), b: withMcpTool('domain.b', 'write') };

    expect(buildMcpCatalog(actions).length).toBe(2);
  });

  it('excludes an action whose policy sets mcpEnabled: false', () => {
    const actions = { a: withMcpTool('domain.a', 'write') };

    const catalog = buildMcpCatalog(actions, { 'domain.a': { mcpEnabled: false } });

    expect(catalog).toEqual([]);
  });

  it('includes an action when its policy omits mcpEnabled', () => {
    const actions = { a: withMcpTool('domain.a', 'write') };

    const catalog = buildMcpCatalog(actions, { 'domain.a': { approvalRequired: true } });

    expect(catalog.map((entry) => entry.action_name)).toEqual(['domain.a']);
  });

  it('includes every mcpTool action when no policy is supplied at all', () => {
    const actions = { a: withMcpTool('domain.a', 'write') };

    expect(buildMcpCatalog(actions).map((entry) => entry.action_name)).toEqual(['domain.a']);
  });

  it('composes the mcpEnabled policy filter with permission/actionNames filters', () => {
    const actions = {
      a: withMcpTool('domain.a', 'read'),
      b: withMcpTool('domain.b', 'read'),
    };

    const catalog = buildMcpCatalog(
      actions,
      { 'domain.a': { mcpEnabled: false } },
      {
        permissions: ['read'],
      },
    );

    expect(catalog.map((entry) => entry.action_name)).toEqual(['domain.b']);
  });
});

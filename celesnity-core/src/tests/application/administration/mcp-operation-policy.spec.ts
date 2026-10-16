import {
  AGENT_MCP_FEATURES,
  MCP_SERVER_FEATURES,
  mcpOperationPermission,
} from '@application/administration/mcp-operation-policy';

describe('MCP capability registry', () => {
  it('includes every classified server in the provisioned Agent feature ceiling', () => {
    expect(new Set(AGENT_MCP_FEATURES)).toEqual(new Set(Object.values(MCP_SERVER_FEATURES)));
    for (const server of Object.keys(MCP_SERVER_FEATURES)) {
      expect(() => mcpOperationPermission(server, 'unregistered')).toThrow('PERMISSION_DENIED');
    }
    expect(MCP_SERVER_FEATURES['mcp-chart']).toBe('ANALYTICS');
    expect(MCP_SERVER_FEATURES['mcp-trino']).toBe('QUERY');
    expect(MCP_SERVER_FEATURES['mcp-skill']).toBe('ADMINISTRATION');
  });
});

import type { Permission } from './authorization-policy';
import type { WorkspaceFeature } from './workspace-feature';

export const MCP_SERVER_FEATURES = {
  'mcp-trino': 'QUERY',
  'mcp-chart': 'ANALYTICS',
  'mcp-document': 'DOCUMENTS',
  'mcp-plant-model': 'PLANT_MODEL',
  'mcp-automation-workflow': 'AUTOMATIONS',
  'mcp-skill': 'ADMINISTRATION',
} as const satisfies Readonly<Record<string, WorkspaceFeature>>;

export const AGENT_MCP_FEATURES: readonly WorkspaceFeature[] = [
  ...new Set(Object.values(MCP_SERVER_FEATURES)),
];

const READ_TOOLS: Readonly<Record<string, readonly string[]>> = {
  'mcp-chart': ['get_chart', 'list_charts', 'preview_chart'],
  'mcp-document': ['get_document_text', 'list_documents'],
  'mcp-trino': [
    'run_query',
    'list_catalogs',
    'list_schemas',
    'list_tables',
    'describe_table',
    'profile_table',
  ],
  'mcp-skill': ['list_skills', 'get_skill'],
  'mcp-automation-workflow': ['get_workflow', 'list_available_agents'],
  'mcp-cloud-files': ['search_files', 'get_file', 'get_spreadsheet_overview', 'read_spreadsheet_range'],
  'mcp-plant-model': [
    'list_plant_model_nodes',
    'get_plant_model_node',
    'traverse_plant_model_routes',
    'resolve_plant_model_catalog_property',
  ],
};
const WRITE_TOOLS: Readonly<Record<string, readonly string[]>> = {
  'mcp-chart': [
    'create_chart',
    'update_chart',
    'move_chart',
    'remove_chart',
    'set_chart_data',
    'set_chart_encodings',
    'set_chart_spec',
    'patch_chart',
  ],
  'mcp-document': ['create_document'],
  'mcp-cloud-files': ['create_spreadsheet'],
  'mcp-skill': ['create_skill', 'update_skill', 'delete_skill'],
  'mcp-automation-workflow': [
    'create_workflow',
    'add_workflow_step',
    'remove_workflow_step',
    'update_workflow_step',
    'update_workflow_trigger',
    'enable_workflow',
    'test_fire_workflow',
  ],
};

export function mcpOperationPermission(server: string, tool: string): Permission {
  if (READ_TOOLS[server]?.includes(tool)) return 'workspace:read';
  if (WRITE_TOOLS[server]?.includes(tool)) return 'workspace:write';
  throw new Error('PERMISSION_DENIED: MCP operation has no registered authorization policy.');
}

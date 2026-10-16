import type { ActionPolicyOverrides } from './action-policy';
import type { ActionDefinition, McpToolSchema } from './action.types';

/** Wire shape served to `mcp-*` clients — snake_case to match their JSON. */
export interface McpToolCatalogEntry {
  readonly tool_name: string;
  readonly action_name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  readonly permission: ActionDefinition<unknown, unknown>['permission'];
  readonly audit_required: boolean;
  /** Whether calling this tool proposes a `PendingAction` instead of running immediately. */
  readonly approval_required: boolean;
}

/**
 * Restricts a catalog to a subset of what a domain's action map could
 * otherwise expose — AIP's Workshop-widget "customize default enabled
 * tools" pattern: an embedding surface asks for read-only access, or for
 * one specific tool, rather than getting the same unfiltered catalog every
 * caller gets today. Both filters are optional and compose with AND; an
 * absent filter imposes no restriction.
 */
export interface McpCatalogFilter {
  /** Keep only actions at one of these permission levels. */
  readonly permissions?: readonly ActionDefinition<unknown, unknown>['permission'][];
  /** Keep only these actions, by `ActionDefinition.name` (e.g. `"chart.create"`). */
  readonly actionNames?: readonly string[];
}

/**
 * Projects a domain's action map into the external tool catalog its MCP
 * server should expose — the single source of truth `mcp-chart` (or any
 * future `mcp-*`) fetches at startup instead of hand-typing JSON schemas
 * that can drift from what the actions actually accept.
 */
export function buildMcpCatalog(
  actions: Readonly<Record<string, ActionDefinition<unknown, unknown>>>,
  policy: ActionPolicyOverrides = {},
  filter?: McpCatalogFilter,
): readonly McpToolCatalogEntry[] {
  return Object.values(actions)
    .filter(hasMcpTool)
    .filter((action) => (policy[action.name]?.mcpEnabled ?? true) === true)
    .filter((action) => !filter?.permissions || filter.permissions.includes(action.permission))
    .filter((action) => !filter?.actionNames || filter.actionNames.includes(action.name))
    .map((action) => ({
      tool_name: action.mcpTool.name,
      action_name: action.name,
      description: action.mcpTool.description,
      input_schema: action.mcpTool.inputSchema,
      permission: action.permission,
      audit_required: action.auditRequired,
      approval_required: action.approvalRequired,
    }));
}

function hasMcpTool<TInput, TOutput>(
  action: ActionDefinition<TInput, TOutput>,
): action is ActionDefinition<TInput, TOutput> & { mcpTool: McpToolSchema } {
  return action.mcpTool !== undefined;
}

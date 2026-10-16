import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { ActionDefinition } from '@application/actions/action.types';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import { ACTION_POLICY_OVERRIDES } from '@application/actions/tokens';
import { buildMcpCatalog, type McpToolCatalogEntry } from '@application/actions/mcp-catalog';
import {
  AUTOMATION_WORKFLOW_ACTIONS,
  type AutomationWorkflowActions,
} from '@application/automation-workflow/automation-workflow.actions';
import { Public } from '@presentation/http/public.decorator';

const VALID_PERMISSIONS = ['read', 'write'] as const;
type Permission = (typeof VALID_PERMISSIONS)[number];

/**
 * Serves the automation-workflow action registry's MCP tool catalog —
 * mirrors `AutomationActionsCatalogController`. See `automation-workflow.actions.ts`
 * and `application/actions/mcp-catalog.ts`.
 */
@ApiTags('automation-workflow-actions')
@Controller('automation-workflow-actions')
export class AutomationWorkflowActionsCatalogController {
  public constructor(
    @Inject(AUTOMATION_WORKFLOW_ACTIONS) private readonly actions: AutomationWorkflowActions,
    @Inject(ACTION_POLICY_OVERRIDES) private readonly policy: ActionPolicyOverrides,
  ) {}

  @Get('mcp-tools')
  @Public()
  @ApiOperation({
    summary:
      'List automation-workflow actions exposed as MCP tools, with their JSON schemas — optionally scoped by permission and/or action name',
  })
  @ApiQuery({
    name: 'permission',
    required: false,
    isArray: true,
    enum: VALID_PERMISSIONS,
    description: 'Keep only actions at these permission levels. Repeatable.',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    isArray: true,
    type: String,
    description:
      'Keep only these actions, by dotted name (e.g. "automation-workflow.create"). Repeatable.',
  })
  public mcpTools(
    @Query('permission') permission?: string | string[],
    @Query('action') action?: string | string[],
  ): readonly McpToolCatalogEntry[] {
    return buildMcpCatalog(
      this.actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
      this.policy,
      { permissions: parsePermissions(permission), actionNames: toArray(action) },
    );
  }
}

function toArray(value: string | string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function parsePermissions(value: string | string[] | undefined): readonly Permission[] | undefined {
  const values = toArray(value);
  if (values === undefined) return undefined;
  for (const v of values) {
    if (!VALID_PERMISSIONS.includes(v as Permission)) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: `permission must be one of: ${VALID_PERMISSIONS.join(', ')}`,
        details: null,
      });
    }
  }
  return values as Permission[];
}
